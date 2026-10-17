import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  type AppChoice,
  catalogEntry,
  type LocalModels,
  PROVIDER_NAMES,
  type Provider,
} from "../models/index.js";
import { WebTransport } from "../transport/index.js";
import { NCT_ID } from "../trials/reference.js";
import { ConversationService } from "./conversations.js";
import type { AgentSource, ConnectionResult } from "./models.js";
import {
  type Estimates,
  isProviderChoice,
  SettingsError,
  type SettingsPatch,
  type SettingsStore,
} from "./settings.js";
import { ConversationStore } from "./store.js";
import {
  pinnedDetail,
  pinnedRows,
  type TrialAction,
  TrialLibrary,
  type TrialsOptions,
} from "./trials.js";
import type { CriteriaSource, FinishedConversation, ServedStudy } from "./types.js";

/**
 * The composition root: the one place that knows a browser is on the other
 * end. It constructs the web transport, hands the service a `MessageTransport`,
 * and adds the routes (spec §6). It is given a Fastify instance rather than
 * creating one, so this file opens no socket; only `start.ts` does.
 */

export interface AppOptions {
  studies: readonly ServedStudy[];
  source: CriteriaSource;
  /** Where each screening's model comes from (slice 0017). */
  agent: AgentSource;
  /** Settings (slice 0017). Without it, there's no Settings screen and the app is always ready. */
  settings?: SettingsRoutesOptions;
  /** Shown in the page's header, so a scripted run is never mistaken for the model. */
  mode: "local-model" | "scripted";
  /** Whether the built-in example trials are served (slice 0013). Absent: they are, if any study is. */
  examples?: boolean;
  /** Where conversations are saved (`chats/`). Without it, they last as long as the process. */
  chatsDir?: string;
  /** The built page (`dist/web`). Without it, only the API is served. */
  webDir?: string;
  /** The port the server listens on; requests must be addressed to it (spec §6.3). */
  port: number;
  /** Finished conversations served for review only: the eval run's (0007 spec §5). */
  finished?: readonly FinishedConversation[];
  /**
   * Adding trials by link on the Trials screen (slice 0013): the registry
   * fetch and the parser to use. Without it, the screen lists the studies
   * served and adding is refused.
   */
  trials?: TrialsOptions;
  now?: () => Date;
}

/** What the Settings routes need (slice 0017). The connection test and the model list are given, so fake mode and tests reach nothing. */
export interface SettingsRoutesOptions {
  store: SettingsStore;
  /** Estimated cost of a screening and a trial read per model, computed by the launcher. */
  estimates: Estimates;
  test: (choice: AppChoice) => Promise<ConnectionResult>;
  localModels: () => Promise<LocalModels>;
}

export interface App {
  service: ConversationService;
  transport: WebTransport;
  trials: TrialLibrary | undefined;
}

export function configureApp(app: FastifyInstance, options: AppOptions): App {
  const transport = new WebTransport();
  const service = new ConversationService({
    studies: options.studies,
    source: options.source,
    agent: options.agent,
    transport,
    ...(options.chatsDir === undefined ? {} : { store: new ConversationStore(options.chatsDir) }),
    ...(options.now === undefined ? {} : { now: options.now }),
    ...(options.finished === undefined ? {} : { finished: options.finished }),
    logError: (error) => app.log.error({ err: error }, "unexpected error in a conversation turn"),
  });

  const trials =
    options.trials === undefined ? undefined : new TrialLibrary(options.trials, service);

  registerGuards(app, options.port);
  transport.register(app);
  registerInspectionRoutes(app, service, options);
  registerTrialRoutes(app, service, trials);
  if (options.settings !== undefined) {
    registerSettingsRoutes(app, options, options.settings);
  }
  registerPage(app, options.webDir);

  return { service, transport, trials };
}

interface Params {
  id: string;
}

/**
 * Settings (slice 0017). Keys go in and never come out: every answer is the
 * store's view, which has no field for one.
 *
 * Each route that changes something needs this app's own `Origin` and a JSON
 * body. The general guard lets a request with no `Origin` through, for curl
 * and tests; these don't, because what they change spends the owner's money.
 * A page on another site can't send JSON here without a preflight, which
 * this server never answers.
 */
function registerSettingsRoutes(
  app: FastifyInstance,
  options: AppOptions,
  settings: SettingsRoutesOptions,
): void {
  const { store } = settings;
  const mode = options.mode === "scripted" ? "scripted" : "live";
  const origins = new Set(LOCAL_NAMES.map((name) => `http://${name}:${options.port}`));
  const view = () => store.view(mode, settings.estimates);

  const ownOrigin = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!origins.has(request.headers.origin ?? "")) {
      return reply.code(403).send({ error: "wrong-origin" });
    }
    const json = (request.headers["content-type"] ?? "").startsWith("application/json");
    if (request.method !== "DELETE" && !json) {
      return reply.code(403).send({ error: "json-only" });
    }
  };
  const refusing = (reply: FastifyReply, act: () => void) => {
    try {
      act();
      return view();
    } catch (error) {
      if (error instanceof SettingsError) {
        return reply.code(400).send({ error: error.message });
      }
      throw error;
    }
  };

  app.get("/api/settings", view);

  app.put<{ Body: SettingsPatch }>("/api/settings", { onRequest: ownOrigin }, (request, reply) =>
    refusing(reply, () => store.update(request.body ?? {})),
  );

  app.put<{ Params: { provider: string }; Body: { key?: unknown } }>(
    "/api/settings/keys/:provider",
    { onRequest: ownOrigin },
    (request, reply) =>
      refusing(reply, () => {
        const { provider } = request.params;
        if (!isProviderChoice(provider)) {
          throw new SettingsError(`No provider called ${provider}`);
        }
        store.saveKey(provider, request.body?.key);
      }),
  );

  app.delete<{ Params: { provider: string } }>(
    "/api/settings/keys/:provider",
    { onRequest: ownOrigin },
    (request, reply) =>
      refusing(reply, () => {
        const { provider } = request.params;
        if (!isProviderChoice(provider)) {
          throw new SettingsError(`No provider called ${provider}`);
        }
        store.removeKey(provider);
      }),
  );

  app.post<{ Body: { provider?: unknown; model?: unknown } }>(
    "/api/settings/test",
    { onRequest: ownOrigin },
    async (request, reply) => {
      const { provider, model } = request.body ?? {};
      if (!isProviderChoice(provider)) {
        return reply.code(400).send({ error: "provider must be omlx, anthropic, openai or xai" });
      }
      const name =
        provider === "omlx"
          ? store.view(mode, {}).local.model
          : typeof model === "string"
            ? model
            : "";
      if (provider !== "omlx" && catalogEntry(provider as Provider, name) === undefined) {
        return reply
          .code(400)
          .send({ error: `${PROVIDER_NAMES[provider]} has no admitted model ${name}` });
      }
      return settings.test({ provider, model: name });
    },
  );

  app.get("/api/settings/local-models", () => settings.localModels());
}

/** The names this server answers to. Anything else reached it by a route it did not choose. */
const LOCAL_NAMES: readonly string[] = ["127.0.0.1", "localhost"];

/**
 * Two checks on every request (spec §6.3).
 *
 * The `Host` must name this machine and this port. A web page elsewhere in the
 * same browser can point a name it controls at 127.0.0.1 (DNS rebinding) and
 * reach a loopback server; the request then arrives with that name in `Host`,
 * and is refused.
 *
 * A request that changes something must not come from another page's origin.
 * Browsers send `Origin` on those; a missing one (curl, tests) is allowed,
 * since only a browser can be tricked into sending a request on someone's
 * behalf.
 */
function registerGuards(app: FastifyInstance, port: number): void {
  const allowed = new Set(LOCAL_NAMES.map((name) => `${name}:${port}`));
  const origins = new Set(LOCAL_NAMES.map((name) => `http://${name}:${port}`));

  app.addHook("onRequest", async (request, reply) => {
    if (!allowed.has(request.headers.host ?? "")) {
      return reply.code(421).send({ error: "wrong-host" });
    }
    const origin = request.headers.origin;
    if (request.method !== "GET" && origin !== undefined && !origins.has(origin)) {
      return reply.code(403).send({ error: "foreign-origin" });
    }
  });
}

/** What the start page and the tester panel read. No participant channel would have these. */
function registerInspectionRoutes(
  app: FastifyInstance,
  service: ConversationService,
  options: AppOptions,
): void {
  app.get("/api/info", () => {
    const choice = options.settings?.store.current();
    const hosted =
      options.mode === "local-model" && choice !== undefined && choice.provider !== "omlx"
        ? { provider: choice.provider, name: PROVIDER_NAMES[choice.provider], model: choice.model }
        : null;
    return {
      mode: options.mode,
      model: options.agent.describe(),
      source: options.source,
      examples: options.examples ?? options.studies.length > 0,
      // Slice 0017: where answers go, and whether a model is set up at all.
      hosted,
      ready: options.mode === "scripted" || (options.settings?.store.ready() ?? true),
    };
  });

  app.get("/api/studies", () =>
    service.studies().map((s) => ({
      nctId: s.study.nctId,
      briefTitle: s.study.briefTitle,
      criteria: s.criteria.length,
      source: s.source ?? options.source,
      origin: s.origin ?? "pinned",
    })),
  );

  app.get("/api/conversations", () => service.list());

  app.post("/api/conversations", (request, reply) => {
    const body = request.body as Record<string, unknown> | null | undefined;
    const nctId = typeof body?.["nctId"] === "string" ? body["nctId"] : undefined;
    if (nctId === undefined) {
      return reply.code(400).send({ error: "nctId is required" });
    }
    if (!service.studies().some((s) => s.study.nctId === nctId)) {
      return reply.code(404).send({ error: `no study ${nctId} is served` });
    }
    return reply.code(201).send({ id: service.start(nctId) });
  });

  // Slice 0014: the coordinator deletes one of their own screenings.
  app.delete<{ Params: Params }>("/api/conversations/:id", (request, reply) => {
    const done = service.remove(request.params.id);
    switch (done.kind) {
      case "removed":
        return reply.code(204).send();
      case "unknown":
        return reply.code(404).send({ error: "unknown-conversation" });
      case "read-only":
        return reply
          .code(409)
          .send({ error: "This conversation is from the eval run and can't be deleted." });
      case "busy":
        return reply
          .code(409)
          .send({ error: "The agent is still replying. Delete it once it has." });
    }
  });

  app.get<{ Params: Params }>("/api/conversations/:id", (request, reply) => {
    const seen = service.inspect(request.params.id);
    return seen === undefined
      ? reply.code(404).send({ error: "unknown-conversation" })
      : reply.send(seen);
  });

  // The coordinator review (0007 spec §4). A finished result or a refusal,
  // never a partial one. There is no route that writes to a review.
  app.get<{ Params: Params }>("/api/conversations/:id/review", (request, reply) => {
    const found = service.review(request.params.id);
    switch (found.kind) {
      case "ok":
        return reply.send(found.review);
      case "unknown":
        return reply.code(404).send({ error: "unknown-conversation" });
      case "not-finished":
      case "no-result":
        return reply.code(409).send({ error: found.kind });
    }
  });
}

/**
 * The Trials screen (slice 0013). Adding or refreshing queues a job and
 * answers 202 at once; the screen polls `GET /api/trials` for its state. An
 * id in a path is checked before it reaches the library, which builds a file
 * path from it.
 */
function registerTrialRoutes(
  app: FastifyInstance,
  service: ConversationService,
  trials: TrialLibrary | undefined,
): void {
  const OFF = { error: "Adding trials isn't available in this server." };

  app.get("/api/trials", () => trials?.rows() ?? pinnedRows(service.studies()));

  // A trial's checklist page (slice 0014). Read only.
  app.get<{ Params: { nctId: string } }>("/api/trials/:nctId", (request, reply) => {
    const { nctId } = request.params;
    const found = NCT_ID.test(nctId)
      ? (trials?.detail(nctId) ?? pinnedDetail(service.studies(), nctId))
      : undefined;
    return found === undefined ? reply.code(404).send({ error: "not-found" }) : reply.send(found);
  });

  app.post("/api/trials", (request, reply) => {
    if (trials === undefined) {
      return reply.code(404).send(OFF);
    }
    const body = request.body as Record<string, unknown> | null | undefined;
    const reference = body?.["reference"];
    if (typeof reference !== "string") {
      return reply.code(400).send({ error: "reference is required" });
    }
    return answer(reply, trials.add(reference), 202);
  });

  app.post<{ Params: { nctId: string } }>("/api/trials/:nctId/refresh", (request, reply) => {
    if (trials === undefined || !NCT_ID.test(request.params.nctId)) {
      return reply.code(404).send(trials === undefined ? OFF : { error: "not-found" });
    }
    return answer(reply, trials.refresh(request.params.nctId), 202);
  });

  app.delete<{ Params: { nctId: string } }>("/api/trials/:nctId", (request, reply) => {
    if (trials === undefined || !NCT_ID.test(request.params.nctId)) {
      return reply.code(404).send(trials === undefined ? OFF : { error: "not-found" });
    }
    return answer(reply, trials.remove(request.params.nctId), 204);
  });
}

function answer(reply: FastifyReply, action: TrialAction, accepted: 202 | 204): FastifyReply {
  if (action.kind === "refused") {
    return reply.code(action.status).send({ error: action.error });
  }
  return accepted === 204 ? reply.code(204).send() : reply.code(202).send({ nctId: action.nctId });
}

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".ico": "image/x-icon",
  ".png": "image/png",
};

/**
 * Serves the built page (spec §8.2). The file list is read once, and a request
 * is answered only with a file on that list: no filesystem path is ever built
 * from a request, so none can escape the directory. Any other path gets the
 * page, except under `/api`, which gets a JSON 404.
 */
function registerPage(app: FastifyInstance, webDir: string | undefined): void {
  const files = new Map<string, { body: Buffer; type: string }>();
  if (webDir !== undefined) {
    for (const path of listFiles(webDir)) {
      const url = `/${relative(webDir, path).split(sep).join("/")}`;
      files.set(url, {
        body: readFileSync(path),
        type: CONTENT_TYPES[extname(path)] ?? "application/octet-stream",
      });
    }
  }
  const index = files.get("/index.html");

  app.setNotFoundHandler((request, reply) => {
    const path = request.url.split("?")[0] ?? "/";
    if (request.method !== "GET" || path === "/api" || path.startsWith("/api/")) {
      return reply.code(404).send({ error: "not-found" });
    }
    const file = files.get(path) ?? index;
    if (file === undefined) {
      return reply.code(404).send({ error: "the page has not been built; run npm run app" });
    }
    return reply.type(file.type).send(file.body);
  });
}

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}
