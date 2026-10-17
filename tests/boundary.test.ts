import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The executable form of this project's binding constraint: the running
 * application depends on no remote service.
 *
 * Asserted by walking the module graph reachable from each module's public
 * entry point and inspecting the source, rather than by mocking `fetch` at
 * runtime — a runtime mock only proves the code paths a test happened to
 * execute.
 *
 * ## The exception, and why it is shaped this way
 *
 * Slice 0002 introduced `src/models/`, which talks to a local model runtime
 * over HTTP. That is the first thing under `src/` to open a socket, and rather
 * than loosen the rule everywhere it is admitted here under two conditions:
 * only `fetch()`, and only to a host on this machine.
 *
 * The exception is applied **per file, not per module graph**. `src/criteria/`
 * imports `src/models/`, so an allowance granted to everything reachable from
 * an entry point that touches the adapter would silently exempt the parser too
 * — which is exactly the rule the parser needs to be under.
 *
 * ## Three frontier hosts, from slice 0008, each in its own file
 *
 * Slice 0008 added adapters for Anthropic, OpenAI and xAI. Each host is a
 * literal in exactly one named file under `src/models/` (`FRONTIER_HOSTS`
 * below), and any other non-loopback host there fails this suite. They are
 * reached only from scripts a person runs with `--spend`: the running
 * application gets its adapter from `createLocalAdapter`, which refuses them,
 * and a test below fails if it names `createAdapter`. Adding a host means
 * adding it here, in the open.
 *
 * ## Two more, from slice 0005, shaped the same way
 *
 * A local server has to listen, and the page has to reach it. Each is
 * admitted in named files only, and only in its narrowest form:
 *
 * - **Listening:** only `src/server/start.ts` may import `fastify` as a value
 *   or call `listen()`, and every `listen()` there must take
 *   `host: LOOPBACK_HOST`, a constant set to `127.0.0.1`. Everything else that
 *   touches Fastify is handed an instance by type, and opens nothing.
 * - **Browser requests:** only `src/transport/web/client.ts` and
 *   `src/web/api.ts` may call `fetch()`, and only with a string or template
 *   literal starting with `/`: this page's own origin, never a variable that
 *   could hold a URL.
 *
 * ## One registry host, from slice 0013
 *
 * The app's Trials screen adds a trial by its NCT ID. Only
 * `src/trials/registry.ts` may call `fetch()` for it, and the only host it may
 * name is `clinicaltrials.gov`. Every other file under `src/trials/` stays
 * under the absolute rule, so the loader still reads fixtures and nothing
 * else.
 */
const SRC_DIR = fileURLToPath(new URL("../src", import.meta.url));
const E2E_DIR = fileURLToPath(new URL("../e2e", import.meta.url));
const PLAYWRIGHT_CONFIG = fileURLToPath(new URL("../playwright.config.ts", import.meta.url));
const FETCH_SCRIPT = fileURLToPath(new URL("../scripts/fetch-trials.ts", import.meta.url));
const REGISTRY_SOURCE = fileURLToPath(new URL("../src/trials/registry.ts", import.meta.url));

/** The one file outside `src/models/` allowed `fetch()`, and the one host it may name (slice 0013). */
const REGISTRY_FILE = `${sep}trials${sep}registry.ts`;
const REGISTRY_HOST = "clinicaltrials.gov";

/** The one directory allowed to reach the network, and the only thing it may use. */
const NETWORK_EXEMPT_DIR = `${sep}models${sep}`;
const EXEMPT_PATTERN = "fetch()";

/** The one file allowed to listen, on loopback only. */
const LISTEN_FILE = `${sep}server${sep}start.ts`;
/** Browser files allowed `fetch()` by relative literal only. */
const RELATIVE_FETCH_FILES: readonly string[] = [
  `${sep}transport${sep}web${sep}client.ts`,
  `${sep}web${sep}api.ts`,
];
/** Entry points with no `index.ts`: the browser half of the transport, and the page. */
const EXTRA_ENTRIES: readonly string[] = [
  fileURLToPath(new URL("../src/transport/web/client.ts", import.meta.url)),
  fileURLToPath(new URL("../src/web/main.tsx", import.meta.url)),
];

/** Hosts a network-exempt module may address. Mirrors `LOOPBACK_HOSTS` in config.ts. */
const LOOPBACK_HOSTS: readonly string[] = ["127.0.0.1", "localhost", "[::1]", "::1"];

/**
 * The frontier hosts, and the only files under `src/models/` that may name
 * each (slice 0008). A literal map, so widening it is a visible diff.
 */
const FRONTIER_HOSTS: Readonly<Record<string, readonly string[]>> = {
  "api.anthropic.com": [`${sep}models${sep}anthropic.ts`, `${sep}models${sep}anthropic-batch.ts`],
  "api.openai.com": [`${sep}models${sep}openai.ts`],
  "api.x.ai": [`${sep}models${sep}xai.ts`],
};

/** Hosts in a network-exempt file that it may not name: not loopback, not its own frontier host. */
function forbiddenHosts(file: string, source?: string): string[] {
  return findHosts(file, source).filter(
    (host) =>
      !LOOPBACK_HOSTS.includes(host) &&
      !(FRONTIER_HOSTS[host] ?? []).some((allowed) => file.endsWith(allowed)),
  );
}

/** Things that reach the network, matched against source with comments removed. */
const NETWORK_PATTERNS: ReadonlyArray<{ name: string; pattern: RegExp }> = [
  { name: EXEMPT_PATTERN, pattern: /\bfetch\s*\(/ },
  { name: "XMLHttpRequest", pattern: /\bXMLHttpRequest\b/ },
  { name: "node:http / node:https", pattern: /["']node:https?["']/ },
  {
    name: "http / https module",
    pattern: /require\s*\(\s*["']https?["']\s*\)|from\s+["']https?["']/,
  },
  { name: "node-fetch", pattern: /["']node-fetch["']/ },
  { name: "undici", pattern: /["']undici["']/ },
  { name: "axios", pattern: /["']axios["']/ },
  { name: "WebSocket", pattern: /\bnew\s+WebSocket\b/ },
  // A value import only. `import type { FastifyInstance }` is erased and opens nothing.
  { name: "fastify", pattern: /^\s*import\s+(?!type\b)[^;]*?from\s+["']fastify["']/m },
  { name: "listen()", pattern: /\.listen\s*\(/ },
];

/**
 * Removes comments so that prose about the network is not mistaken for code
 * that uses it. Several files say "no network, ever" and point at
 * `npm run fetch:trials`, and a grep that flagged those would be useless.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function isNetworkExempt(file: string): boolean {
  return file.includes(NETWORK_EXEMPT_DIR);
}

function isRegistryFile(file: string): boolean {
  return file.endsWith(REGISTRY_FILE);
}

function isListenFile(file: string): boolean {
  return file.endsWith(LISTEN_FILE);
}

function isRelativeFetchFile(file: string): boolean {
  return RELATIVE_FETCH_FILES.some((f) => file.endsWith(f));
}

/** Every `fetch(` takes a string or template literal starting with `/`. */
function fetchesAreRelative(code: string): boolean {
  const calls = code.match(/\bfetch\s*\(/g)?.length ?? 0;
  const relative = code.match(/\bfetch\s*\(\s*["'`]\//g)?.length ?? 0;
  return calls === relative;
}

/** Every `listen(` passes `host: LOOPBACK_HOST`, and that constant is loopback. */
function listensOnLoopback(code: string): boolean {
  const calls = code.match(/\.listen\s*\(/g)?.length ?? 0;
  const loopback =
    code.match(/\.listen\s*\(\s*\{[^}]*\bhost:\s*LOOPBACK_HOST\b[^}]*\}/g)?.length ?? 0;
  return calls === loopback && /\bLOOPBACK_HOST\s*=\s*"127\.0\.0\.1"/.test(code);
}

/** Network usage that is not permitted in this particular file. */
function findNetworkUsage(file: string, source?: string): string[] {
  const code = stripComments(source ?? readFileSync(file, "utf8"));

  return NETWORK_PATTERNS.filter(({ name, pattern }) => {
    if (!pattern.test(code)) {
      return false;
    }
    if (name === EXEMPT_PATTERN) {
      if (isNetworkExempt(file) || isRegistryFile(file)) {
        return false;
      }
      if (isRelativeFetchFile(file)) {
        return !fetchesAreRelative(code);
      }
    }
    if (name === "fastify" && isListenFile(file)) {
      return false;
    }
    if (name === "listen()" && isListenFile(file)) {
      return !listensOnLoopback(code);
    }
    return true;
  }).map(({ name }) => name);
}

/** Hosts appearing as URL literals in a file, whether or not it is exempt. */
function findHosts(file: string, source?: string): string[] {
  const code = stripComments(source ?? readFileSync(file, "utf8"));
  const hosts: string[] = [];

  for (const match of code.matchAll(/https?:\/\/([^/"'`\s:]+|\[[^\]]+\])/g)) {
    const host = match[1];
    if (host !== undefined) {
      hosts.push(host);
    }
  }

  return hosts;
}

/**
 * Drops type-only imports, which are erased before anything runs.
 *
 * `import type { X } from "./y.js"` emits no require and no module load, so a
 * file reached only that way cannot execute, cannot open a socket and cannot
 * call a parser. Following it overstates reachability: `src/criteria/types.ts`
 * imports `ModelRunMetadata` from the models barrel, which would otherwise put
 * every adapter in the import graph of anything that names a criterion type.
 *
 * Only the fully type-only form is removed. `import { type A, b }` still loads
 * the module for `b` and is left alone.
 */
function stripTypeOnlyImports(source: string): string {
  return source.replace(/import\s+type\s+[\s\S]*?from\s+["'][^"']+["'];?/g, "");
}

/** Walks relative imports, mapping the ESM `.js` specifier back to its `.ts` source. */
function reachableModules(entry: string): string[] {
  const seen = new Set<string>();
  const queue = [entry];

  while (queue.length > 0) {
    const file = queue.pop();
    if (file === undefined || seen.has(file)) {
      continue;
    }
    seen.add(file);

    const source = stripTypeOnlyImports(stripComments(readFileSync(file, "utf8")));
    for (const match of source.matchAll(/from\s+["'](\.[^"']+)["']/g)) {
      const specifier = match[1];
      if (specifier === undefined) {
        continue;
      }
      // `.js` names the compiled file: the source is `.ts`, or `.tsx` in the page.
      const base = resolve(dirname(file), specifier.replace(/\.js$/, ""));
      const resolved = [`${base}.ts`, `${base}.tsx`].find((candidate) => existsSync(candidate));
      if (resolved !== undefined) {
        queue.push(resolved);
      }
    }
  }

  return [...seen];
}

/**
 * Every module's public entry point, discovered rather than listed.
 *
 * A hardcoded list would silently stop covering a module added in a later
 * slice, which is the failure this whole file exists to prevent.
 */
function entryPoints(): string[] {
  return readdirSync(SRC_DIR, { withFileTypes: true })
    .filter((item) => item.isDirectory())
    .map((item) => resolve(SRC_DIR, item.name, "index.ts"))
    .concat(EXTRA_ENTRIES)
    .filter((path) => existsSync(path));
}

describe("no network under src/", () => {
  const entries = entryPoints();
  const modules = [...new Set(entries.flatMap(reachableModules))];

  // Without this, a walker that silently returned nothing would make the
  // assertions below pass by examining zero files.
  it("actually walks the module graph from every module entry point", () => {
    expect(entries.length).toBeGreaterThanOrEqual(2);
    expect(modules.length).toBeGreaterThanOrEqual(8);
    expect(modules.some((m) => m.endsWith("load.ts"))).toBe(true);
    expect(modules.some((m) => m.endsWith("validate.ts"))).toBe(true);
    expect(modules.some((m) => m.endsWith("corpus.ts"))).toBe(true);
    expect(modules.some((m) => m.endsWith(`models${sep}omlx.ts`))).toBe(true);
    // Slice 0004: the screening agent is walked like everything else.
    expect(modules.length).toBeGreaterThanOrEqual(20);
    expect(modules.some((m) => m.endsWith(`screening${sep}session.ts`))).toBe(true);
    // Slice 0005: the server, the one file that listens, and the browser client.
    expect(modules.some((m) => m.endsWith(LISTEN_FILE))).toBe(true);
    expect(modules.some((m) => m.endsWith(`transport${sep}web${sep}client.ts`))).toBe(true);
    expect(modules.some((m) => m.endsWith(`web${sep}main.tsx`))).toBe(true);
    expect(modules.some((m) => m.endsWith(`web${sep}CriterionText.tsx`))).toBe(true);
    expect(modules.some((m) => m.endsWith(`plain${sep}render.ts`))).toBe(true);
    expect(modules.some((m) => m.endsWith(`plain${sep}load.ts`))).toBe(true);
  });

  it("reaches nothing that touches the network, outside the models module", () => {
    const offenders = modules
      .map((file) => ({ file, usage: findNetworkUsage(file) }))
      .filter(({ usage }) => usage.length > 0);

    expect(offenders).toEqual([]);
  });

  // The exception is for one directory and one function. A models file that
  // reached for axios or node:http would still fail the assertion above.
  it("exempts only the models module, and only fetch()", () => {
    const exempt = modules.filter(isNetworkExempt);

    expect(exempt.length).toBeGreaterThanOrEqual(3);
    expect(findNetworkUsage("/src/models/omlx.ts", "await fetch(url);")).toEqual([]);
    expect(findNetworkUsage("/src/models/omlx.ts", "import http from 'node:http';")).toEqual([
      "node:http / node:https",
    ]);
  });

  // Applied per file rather than per graph: src/criteria/ imports src/models/,
  // and a graph-level allowance would exempt the parser along with the adapter.
  it("does not extend the exemption to files that merely import the adapter", () => {
    expect(findNetworkUsage("/src/criteria/parse.ts", "await fetch(url);")).toEqual(["fetch()"]);
  });

  // Slice 0005's two exceptions, each proved to fire.
  it("lets only start.ts import fastify as a value, and a type import anywhere", () => {
    expect(findNetworkUsage("/src/screening/session.ts", 'import Fastify from "fastify";')).toEqual(
      ["fastify"],
    );
    expect(findNetworkUsage("/src/server/app.ts", 'import Fastify from "fastify";')).toEqual([
      "fastify",
    ]);
    expect(
      findNetworkUsage("/src/server/app.ts", 'import type { FastifyInstance } from "fastify";'),
    ).toEqual([]);
  });

  it("lets start.ts listen only on the loopback constant", () => {
    const good =
      'import Fastify from "fastify";\nexport const LOOPBACK_HOST = "127.0.0.1";\n' +
      "await app.listen({ host: LOOPBACK_HOST, port });";
    expect(findNetworkUsage("/src/server/start.ts", good)).toEqual([]);
    expect(
      findNetworkUsage(
        "/src/server/start.ts",
        good.replace("host: LOOPBACK_HOST", 'host: "0.0.0.0"'),
      ),
    ).toEqual(["listen()"]);
    expect(
      findNetworkUsage("/src/server/start.ts", good.replace('"127.0.0.1"', '"0.0.0.0"')),
    ).toEqual(["listen()"]);
    expect(findNetworkUsage("/src/server/app.ts", "await app.listen({ port: 80 });")).toEqual([
      "listen()",
    ]);
  });

  it("lets the browser files fetch only relative literals, and nothing else fetch at all", () => {
    const client = "/src/transport/web/client.ts";
    expect(findNetworkUsage(client, "await fetch(`/api/conversations/c1/messages`);")).toEqual([]);
    expect(findNetworkUsage(client, 'await fetch("/api/info");')).toEqual([]);
    expect(findNetworkUsage(client, 'await fetch("http://example.com/api");')).toEqual(["fetch()"]);
    expect(findNetworkUsage(client, "await fetch(url);")).toEqual(["fetch()"]);
    expect(findNetworkUsage("/src/web/App.tsx", 'await fetch("/api/info");')).toEqual(["fetch()"]);
  });

  // Every file under src/models/, reachable or not, so a host can't sit in a
  // file nothing imports yet and slip in later.
  it("lets the models module address this machine, and each frontier host only in its own file", () => {
    const offenders = allSourceFiles(SRC_DIR)
      .filter(isNetworkExempt)
      .map((file) => ({ file, hosts: forbiddenHosts(file) }))
      .filter(({ hosts }) => hosts.length > 0);

    expect(offenders).toEqual([]);
  });

  // Proves the map is live: each host really is named where it's allowed.
  it("finds each frontier host in the file named for it", () => {
    for (const [host, files] of Object.entries(FRONTIER_HOSTS)) {
      const naming = allSourceFiles(SRC_DIR).filter((f) => findHosts(f).includes(host));
      expect(naming.length, host).toBeGreaterThan(0);
      expect(
        naming.every((f) => files.some((allowed) => f.endsWith(allowed))),
        host,
      ).toBe(true);
    }
  });

  // Slice 0013: the registry file is reached by the server, fetches, and names one host.
  it("lets only registry.ts under src/trials/ fetch, and only from clinicaltrials.gov", () => {
    expect(existsSync(REGISTRY_SOURCE)).toBe(true);
    expect(findHosts(REGISTRY_SOURCE)).toEqual([REGISTRY_HOST]);
    const others = allSourceFiles(join(SRC_DIR, "trials"))
      .filter((f) => !isRegistryFile(f))
      .map((file) => ({ file, usage: findNetworkUsage(file), hosts: findHosts(file) }))
      .filter(({ usage, hosts }) => usage.length > 0 || hosts.length > 0);
    expect(others).toEqual([]);
  });

  it("would catch a fetch in another trials file, or another host in the registry file", () => {
    expect(findNetworkUsage("/src/trials/load.ts", "await fetch(url);")).toEqual(["fetch()"]);
    expect(findNetworkUsage("/src/server/trials.ts", "await fetch(url);")).toEqual(["fetch()"]);
    expect(findNetworkUsage("/src/trials/registry.ts", "import http from 'node:http';")).toEqual([
      "node:http / node:https",
    ]);
    expect(
      findHosts("/src/trials/registry.ts", 'await fetch("https://example.com/api");'),
    ).not.toEqual([REGISTRY_HOST]);
  });

  // The fetch script must not be reachable from any application entry point.
  it("does not reach the fetch script", () => {
    expect(modules).not.toContain(FETCH_SCRIPT);
  });

  // Proves the detector works. If this ever passes with an empty result, the
  // assertions above are meaningless and every other test here is theatre.
  it("detects network use in the registry file, which is the known offender", () => {
    const source = readFileSync(REGISTRY_SOURCE, "utf8");
    expect(findNetworkUsage("/src/trials/load.ts", source)).toContain("fetch()");
  });

  // Proves the host rule works. A check that cannot fail is not doing its job.
  it("detects a non-loopback host in an otherwise exempt file", () => {
    const source = 'const url = "https://api.example.com/v1/chat/completions";';
    const hosts = findHosts("/src/models/omlx.ts", source);

    expect(hosts).toEqual(["api.example.com"]);
    expect(forbiddenHosts("/src/models/omlx.ts", source)).toEqual(["api.example.com"]);
  });

  // A frontier host is allowed in its own file and nowhere else, not even
  // another frontier adapter.
  it("detects a frontier host in the wrong file", () => {
    const anthropic = 'const u = "https://api.anthropic.com/v1/messages";';
    expect(forbiddenHosts(`${sep}src${sep}models${sep}anthropic.ts`, anthropic)).toEqual([]);
    expect(forbiddenHosts(`${sep}src${sep}models${sep}openai.ts`, anthropic)).toEqual([
      "api.anthropic.com",
    ]);
    expect(forbiddenHosts(`${sep}src${sep}models${sep}omlx.ts`, anthropic)).toEqual([
      "api.anthropic.com",
    ]);
  });

  it("accepts the loopback forms the adapter actually uses", () => {
    const source = 'const a = "http://127.0.0.1:8000/v1"; const b = "http://localhost:8000/v1";';

    expect(
      findHosts("/src/models/config.ts", source).every((h) => LOOPBACK_HOSTS.includes(h)),
    ).toBe(true);
  });

  // Proves the type-import rule is precise: it must not drop a value import
  // that happens to mention a type.
  it("drops only fully type-only imports", () => {
    expect(stripTypeOnlyImports('import type { A } from "./a.js";')).not.toMatch(/a\.js/);
    expect(stripTypeOnlyImports('import { type A, b } from "./a.js";')).toMatch(/a\.js/);
    expect(stripTypeOnlyImports('import { a } from "./a.js";')).toMatch(/a\.js/);
  });

  // Proves the comment stripper does not hide real code.
  it("does not let a comment conceal a network call", () => {
    const withComment = stripComments("// we never call fetch() here\nawait fetch(url);");

    expect(/\bfetch\s*\(/.test(withComment)).toBe(true);
    expect(stripComments("// only a comment about fetch()\n")).not.toMatch(/\bfetch\s*\(/);
  });
});

/**
 * The labelling tool must not be able to see what the parser found.
 *
 * Ground truth seeded from parser output agrees with the parser by
 * construction, and every number the eval harness then reports is circular —
 * it would be measuring whether the parser agrees with itself. That property
 * lives in an import graph rather than in a person's discipline, so it is
 * asserted here alongside the network rule.
 *
 * The tool may use `src/criteria/normalize.ts`, so that labels and predictions
 * share a coordinate system. It may not reach `parse.ts` or any model.
 */
describe("the labelling tool cannot see the parser", () => {
  const LABEL_SCRIPT = fileURLToPath(new URL("../scripts/label-criteria.ts", import.meta.url));
  const modules = reachableModules(LABEL_SCRIPT);

  const forbidden = (file: string): boolean =>
    file.includes(`${sep}models${sep}`) || file.endsWith(`criteria${sep}parse.ts`);

  it("walks a real graph", () => {
    expect(modules.length).toBeGreaterThanOrEqual(3);
    expect(modules.some((m) => m.endsWith(`criteria${sep}normalize.ts`))).toBe(true);
  });

  it("reaches neither the parser nor a model", () => {
    expect(modules.filter(forbidden)).toEqual([]);
  });

  it("reaches nothing that touches the network", () => {
    const offenders = modules
      .map((file) => ({ file, usage: findNetworkUsage(file) }))
      .filter(({ usage }) => usage.length > 0);

    expect(offenders).toEqual([]);
  });

  // Proves the rule would fire. A check that cannot fail is not doing its job,
  // and this one guards the credibility of every number in the README.
  it("would catch an import of the parser or a model", () => {
    expect(forbidden("/src/criteria/parse.ts")).toBe(true);
    expect(forbidden(`${sep}src${sep}models${sep}omlx.ts`)).toBe(true);
    expect(forbidden("/src/criteria/normalize.ts")).toBe(false);
  });
});

/**
 * Slice 0004's two boundaries: the application cannot see the measurement, and
 * nothing outside `src/models/` chooses which model to call.
 *
 * Walked over every file under `src/` rather than a module graph, because both
 * are about what a file may name, not what it reaches.
 */
function allSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(dir, entry.name);
    return entry.isDirectory() ? allSourceFiles(path) : path.endsWith(".ts") ? [path] : [];
  });
}

/** Import specifiers that reach into `evals/`. */
function importsFromEvals(source: string): string[] {
  return [...stripComments(source).matchAll(/from\s+["']([^"']*evals\/[^"']*)["']/g)].flatMap(
    (m) => (m[1] === undefined ? [] : [m[1]]),
  );
}

/** The concrete adapter classes, which only the factory in `src/models/` may use as values. */
const ADAPTER_CLASSES = [
  "OmlxAdapter",
  "AnthropicAdapter",
  "AnthropicBatchAdapter",
  "OpenAIAdapter",
  "XaiAdapter",
  "FrontierChatAdapter",
] as const;

/** A value (not type-only) use of a concrete adapter. */
function usesConcreteAdapter(source: string): boolean {
  const code = stripTypeOnlyImports(stripComments(source));
  return ADAPTER_CLASSES.some((name) => new RegExp(`\\b${name}\\b`).test(code));
}

/** A value use of the factory that can build a frontier adapter. */
function usesFrontierFactory(source: string): boolean {
  return /\bcreateAdapter\b/.test(stripTypeOnlyImports(stripComments(source)));
}

/** The running app's factory (slice 0017). */
const APP_MODELS = `${sep}src${sep}server${sep}models.ts`;

function usesAppFactory(source: string): boolean {
  return /\bcreateAppAdapter\b/.test(stripTypeOnlyImports(stripComments(source)));
}

/** A mention of a frontier provider's key variable. */
function namesKeyVariable(source: string): boolean {
  return /\b(ANTHROPIC_API_KEY|OPENAI_API_KEY|XAI_API_KEY)\b/.test(stripComments(source));
}

const SCRIPTS_DIR = fileURLToPath(new URL("../scripts", import.meta.url));

describe("the screening agent cannot see the measurement", () => {
  const files = allSourceFiles(SRC_DIR);

  it("walks every source file", () => {
    expect(files.some((f) => f.endsWith(`screening${sep}session.ts`))).toBe(true);
  });

  // Without this, "the agent never sees the vignette" rests on discipline.
  it("has no file under src/ importing from evals/", () => {
    const offenders = files.filter((f) => importsFromEvals(readFileSync(f, "utf8")).length > 0);
    expect(offenders).toEqual([]);
  });

  it("would catch an import from evals/", () => {
    expect(
      importsFromEvals('import { loadVignettes } from "../../evals/cases/vignettes.js";'),
    ).toEqual(["../../evals/cases/vignettes.js"]);
    expect(importsFromEvals('import { x } from "./apply.js";')).toEqual([]);
  });
});

describe("only src/models/ chooses a model", () => {
  const files = [...allSourceFiles(SRC_DIR), ...allSourceFiles(SCRIPTS_DIR)].filter(
    (f) => !isNetworkExempt(f),
  );

  it("walks the scripts as well as src/", () => {
    expect(files.some((f) => f.endsWith(`scripts${sep}run-screening-eval.ts`))).toBe(true);
    expect(files.some((f) => f.endsWith(`scripts${sep}app${sep}eval-run.ts`))).toBe(true);
  });

  // The screening agent and the parser receive a ModelAdapter; neither can
  // construct one. Since slice 0008 the scripts can't either: they ask the
  // factory, so choosing a model is a command-line spec, never a code change.
  it("has no file outside src/models/ using a concrete adapter as a value", () => {
    const offenders = files.filter((f) => usesConcreteAdapter(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("would catch one, and ignores a type-only mention", () => {
    expect(usesConcreteAdapter('import { OmlxAdapter } from "../models/index.js";')).toBe(true);
    expect(usesConcreteAdapter("const a = new OmlxAdapter();")).toBe(true);
    expect(usesConcreteAdapter("const a = new AnthropicAdapter({ model });")).toBe(true);
    expect(usesConcreteAdapter('import type { OmlxAdapter } from "../models/index.js";')).toBe(
      false,
    );
    expect(usesConcreteAdapter("// never construct an OmlxAdapter here")).toBe(false);
  });
});

/**
 * Slice 0008: the running application couldn't reach a frontier provider.
 * Slice 0017 (owner, 2026-10): it may, but only through Settings.
 *
 * The page, the server and the terminal chat take text a person types, and
 * the plain renderer writes files the coordinator review shows. The terminal
 * chat and the renderer get an adapter from `createLocalAdapter`, which
 * refuses frontier specs. The page and the server reach a hosted provider
 * only when a person chose one in Settings and saved a key there, through
 * `createAppAdapter`, which always wraps it in the budget, and only from the
 * one server file that builds the app's models. Naming `createAdapter` would
 * be the way around both, so it's still forbidden everywhere here.
 */
describe("the running application reaches a hosted provider only through Settings", () => {
  const LOCAL_ONLY = [
    ...allSourceFiles(join(SRC_DIR, "server")),
    ...allSourceFiles(join(SRC_DIR, "transport")),
    ...allSourceFiles(join(SRC_DIR, "web")),
    ...allSourceFiles(join(SCRIPTS_DIR, "app")),
    join(SCRIPTS_DIR, "app.ts"),
    join(SCRIPTS_DIR, "chat.ts"),
    join(SCRIPTS_DIR, "render-plain.ts"),
    // The browser test (slice 0010) drives the page; it never builds an adapter.
    ...allSourceFiles(E2E_DIR),
  ];

  it("covers the page, the server, the app launcher, the chat and the renderer", () => {
    expect(LOCAL_ONLY.some((f) => f.endsWith(`server${sep}conversations.ts`))).toBe(true);
    expect(LOCAL_ONLY.filter((f) => f.startsWith(SCRIPTS_DIR)).length).toBeGreaterThanOrEqual(4);
  });

  it("never names the factory that builds frontier adapters", () => {
    const offenders = LOCAL_ONLY.filter((f) => usesFrontierFactory(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  // Slice 0017: the app's own factory, from the one file that builds the app's models.
  it("names the app's factory only in the server file that builds the app's models", () => {
    const naming = LOCAL_ONLY.filter((f) => usesAppFactory(readFileSync(f, "utf8")));
    expect(naming.map((f) => f.slice(f.indexOf(`${sep}src${sep}`)))).toEqual([APP_MODELS]);
  });

  it("would catch the app's factory named anywhere else", () => {
    expect(usesAppFactory('import { createAppAdapter } from "../models/index.js";')).toBe(true);
    expect(usesAppFactory("// createAppAdapter lives in src/server/models.ts")).toBe(false);
  });

  it("would catch it", () => {
    expect(usesFrontierFactory('import { createAdapter } from "../src/models/index.js";')).toBe(
      true,
    );
    expect(usesFrontierFactory("createLocalAdapter(spec)")).toBe(false);
    expect(usesFrontierFactory('import type { createAdapter } from "./x.js";')).toBe(false);
  });

  // Slice 0010: the browser test runs the page with the scripted agent, so
  // `npm run test:e2e` can never reach a model, local or frontier.
  it("starts the browser test's server with the scripted agent and no model flag", () => {
    const command = webServerCommand(readFileSync(PLAYWRIGHT_CONFIG, "utf8"));
    expect(command).toContain("npm run app");
    expect(runsScriptedAgentOnly(command)).toBe(true);
  });

  it("would catch a browser test given a model", () => {
    expect(runsScriptedAgentOnly("npm run app -- --fake --port 5015")).toBe(true);
    // Slice 0013: where the test's added trials go names no model.
    expect(runsScriptedAgentOnly("npm run app -- --fake --trials-dir e2e/.out/trials")).toBe(true);
    expect(runsScriptedAgentOnly("npm run app -- --port 5015")).toBe(false);
    expect(runsScriptedAgentOnly("npm run app -- --fake --source parse")).toBe(false);
    expect(runsScriptedAgentOnly("npm run app -- --fake --agent anthropic --spend")).toBe(false);
    expect(runsScriptedAgentOnly("npm run app -- --fake --model omlx")).toBe(false);
  });
});

/** The `command:` string in Playwright's config, or "" if there is none. */
function webServerCommand(config: string): string {
  const m = /\bcommand:\s*(?:"([^"]*)"|'([^']*)'|`([^`]*)`)/.exec(stripComments(config));
  return m?.[1] ?? m?.[2] ?? m?.[3] ?? "";
}

/** Whether a command runs the app with the scripted agent and names no model or other source. */
function runsScriptedAgentOnly(command: string): boolean {
  return (
    /\s--fake\b/.test(command) &&
    !/--(agent|model|participant|fidelity|spend|source)\b/.test(command)
  );
}

/**
 * Slice 0008: a provider's key is read in one file. Anywhere else, a script
 * holding a key's value is one `console.log` from printing it.
 */
describe("keys are read in one place", () => {
  const KEYS_FILE = `${sep}models${sep}keys.ts`;

  it("names the key variables only in src/models/keys.ts", () => {
    const naming = [...allSourceFiles(SRC_DIR), ...allSourceFiles(SCRIPTS_DIR)].filter((f) =>
      namesKeyVariable(readFileSync(f, "utf8")),
    );
    expect(naming.map((f) => f.slice(f.lastIndexOf(`${sep}models${sep}`)))).toEqual([KEYS_FILE]);
  });

  it("would catch a script reading one", () => {
    expect(namesKeyVariable('const key = process.env["ANTHROPIC_API_KEY"];')).toBe(true);
    expect(namesKeyVariable("// ANTHROPIC_API_KEY lives in .env")).toBe(false);
  });
});

/**
 * The page runs in a browser. Its tsconfig sees Node's types only so it can
 * import the server's response types (slice 0005), which makes this the check
 * that nothing Node-only slipped into browser code.
 */
function usesNode(source: string): boolean {
  const code = stripTypeOnlyImports(stripComments(source));
  return /from\s+["']node:/.test(code) || /\bprocess\./.test(code);
}

describe("the page is browser code", () => {
  const WEB_DIR = resolve(SRC_DIR, "web");
  const files = readdirSync(WEB_DIR)
    .filter((f) => /\.tsx?$/.test(f))
    .map((f) => resolve(WEB_DIR, f));

  it("walks the page's files", () => {
    expect(files.some((f) => f.endsWith("main.tsx"))).toBe(true);
    expect(files.some((f) => f.endsWith("logic.ts"))).toBe(true);
  });

  it("imports no Node module and reads no process state", () => {
    expect(files.filter((f) => usesNode(readFileSync(f, "utf8")))).toEqual([]);
  });

  it("would catch either, and ignores a type-only import", () => {
    expect(usesNode('import { readFileSync } from "node:fs";')).toBe(true);
    expect(usesNode("const key = process.env.KEY;")).toBe(true);
    expect(usesNode('import type { X } from "node:fs";')).toBe(false);
  });
});

/**
 * Slice 0005's transport boundary: nothing outside `src/transport/` knows how
 * messages are delivered (CLAUDE.md). Asserted over source, like the others.
 */
function importsFrom(source: string, dir: string): string[] {
  const code = stripComments(source);
  return [...code.matchAll(/from\s+["']([^"']+)["']/g)].flatMap((m) =>
    m[1]?.includes(`/${dir}/`) ? [m[1]] : [],
  );
}

describe("only src/transport/ knows how messages are delivered", () => {
  const files = allSourceFiles(SRC_DIR).concat(
    readdirSync(resolve(SRC_DIR, "web"))
      .filter((f) => f.endsWith(".tsx"))
      .map((f) => resolve(SRC_DIR, "web", f)),
  );
  const source = (suffix: string): string => {
    const file = files.find((f) => f.endsWith(suffix));
    if (file === undefined) {
      throw new Error(`no source file ending ${suffix}`);
    }
    return readFileSync(file, "utf8");
  };

  it("keeps the conversation agent ignorant of transports and servers", () => {
    const screening = files.filter((f) => f.includes(`${sep}screening${sep}`));
    expect(screening.length).toBeGreaterThanOrEqual(8);
    const offenders = screening.filter((f) => {
      const code = readFileSync(f, "utf8");
      return importsFrom(code, "transport").length > 0 || importsFrom(code, "server").length > 0;
    });
    expect(offenders).toEqual([]);
  });

  it("gives the conversation service only the MessageTransport type", () => {
    const code = stripTypeOnlyImports(source(`server${sep}conversations.ts`));
    expect(importsFrom(code, "transport")).toEqual([]);
    expect(code).not.toMatch(/\bWebTransport\b|\bMemoryTransport\b/);
  });

  it("constructs the web transport only in the composition root", () => {
    const constructing = files.filter((f) =>
      /\bnew\s+WebTransport\b/.test(stripComments(readFileSync(f, "utf8"))),
    );
    expect(constructing.map((f) => f.slice(SRC_DIR.length))).toEqual([`${sep}server${sep}app.ts`]);
  });

  // Anthropic's endpoint is `/v1/messages`, a provider's URL rather than this
  // app's route, and it lives in `src/models/` under that directory's own
  // named-host rule. Excluded by directory, so a route leaking into any other
  // file is still caught (slice 0008).
  it("names the message routes only in the transport's routes and its browser client", () => {
    const naming = files.filter(
      (f) =>
        !isNetworkExempt(f) &&
        /\/(messages|retry)[`"']/.test(stripComments(readFileSync(f, "utf8"))),
    );
    expect(naming.map((f) => f.slice(SRC_DIR.length)).sort()).toEqual([
      `${sep}transport${sep}web${sep}client.ts`,
      `${sep}transport${sep}web${sep}routes.ts`,
    ]);
  });

  it("would catch a violation", () => {
    expect(importsFrom('import { x } from "../transport/index.js";', "transport")).toHaveLength(1);
    expect(
      importsFrom(
        stripTypeOnlyImports('import type { X } from "../transport/index.js";'),
        "transport",
      ),
    ).toEqual([]);
  });
});

/**
 * The seam slice 0006 needed: every criterion's words on the page go through
 * one component, so plain language was added in one place (0005 spec §7.3).
 * Since 0006 that covers the rendering too: its text or its problems, or the
 * function that lays them out.
 */
function readsCriterionText(source: string): boolean {
  const code = stripComments(source);
  return (
    /\b(criterion|c)\??\.text\b/.test(code) ||
    /\bplain\??\.(text|problems)\b/.test(code) ||
    /\bplainView\s*\(/.test(code)
  );
}

describe("the page shows a criterion's words in one place", () => {
  const WEB_DIR = resolve(SRC_DIR, "web");
  // Every page file, not only components: since 0007 the review's model is a
  // .ts file, and it must carry criteria without reading their words.
  // logic.ts is where plainView is defined, for CriterionText to call.
  const components = readdirSync(WEB_DIR)
    .filter((f) => /\.tsx?$/.test(f) && f !== "logic.ts")
    .map((f) => resolve(WEB_DIR, f));

  it("covers the review's model", () => {
    expect(components.map((f) => f.slice(WEB_DIR.length + 1))).toContain("review.ts");
  });

  it("has CriterionText read it, and no other component", () => {
    const readers = components.filter((f) => readsCriterionText(readFileSync(f, "utf8")));
    expect(readers.map((f) => f.slice(WEB_DIR.length + 1))).toEqual(["CriterionText.tsx"]);
  });

  it("would catch another component reading it", () => {
    expect(readsCriterionText("<p>{row.criterion.text}</p>")).toBe(true);
    expect(readsCriterionText("criteria.map((c) => c.text)")).toBe(true);
    expect(readsCriterionText("<p>{row.plain?.text}</p>")).toBe(true);
    expect(readsCriterionText("plain.problems.map((p) => <li>{p}</li>)")).toBe(true);
    expect(readsCriterionText("const view = plainView(row.plain);")).toBe(true);
    expect(readsCriterionText("<CriterionText criterion={row.criterion} />")).toBe(false);
    expect(
      readsCriterionText("<CriterionText criterion={row.criterion} plain={row.plain} />"),
    ).toBe(false);
  });
});

/**
 * Slice 0007's rule for the coordinator review, as far as a source check can
 * see it: no row is styled by how its finding went (spec §6.5). The model is
 * held to the rest by the flip test in `tests/web/review.test.ts`; this covers
 * what the component adds, its class names.
 */
function stylesByOutcome(source: string): boolean {
  const code = stripComments(source);
  return [...code.matchAll(/className=\{([^}]*)\}/g)].some((m) =>
    /\b(finding|status|polarity|reported|reading)\b/.test(m[1] ?? ""),
  );
}

describe("the coordinator review styles rows by group only", () => {
  const REVIEW_PAGE = resolve(SRC_DIR, "web", "ReviewPage.tsx");

  it("has no class name that depends on a finding", () => {
    expect(stylesByOutcome(readFileSync(REVIEW_PAGE, "utf8"))).toBe(false);
  });

  it("would catch one that did", () => {
    expect(stylesByOutcome("<li className={`row ${row.finding}`}>")).toBe(true);
    expect(stylesByOutcome("<span className={row.polarity}>")).toBe(true);
    expect(stylesByOutcome("<section className={`review-group group-${g.key}`}>")).toBe(false);
  });
});

/**
 * Slice 0006's boundary: plain language is display only (spec D2). The agent
 * asks and reads from the protocol's words, so 0004's numbers still describe
 * it. Without this, "the agent never sees a rendering" rests on discipline.
 */
describe("the agent cannot see a plain-language rendering", () => {
  const files = allSourceFiles(SRC_DIR);
  const screening = files.filter((f) => f.includes(`${sep}screening${sep}`));

  it("has no file under src/screening/ importing from src/plain/", () => {
    expect(screening.length).toBeGreaterThanOrEqual(8);
    const offenders = screening.filter(
      (f) => importsFrom(readFileSync(f, "utf8"), "plain").length > 0,
    );
    expect(offenders).toEqual([]);
  });

  it("gives the agent's criterion exactly four fields, none of them a rendering", () => {
    const types = readFileSync(resolve(SRC_DIR, "screening", "types.ts"), "utf8");
    expect(interfaceFields(types, "ScreeningCriterion")).toEqual([
      "id",
      "polarity",
      "type",
      "text",
    ]);
  });

  it("would catch either", () => {
    expect(importsFrom('import { displayFor } from "../plain/index.js";', "plain")).toHaveLength(1);
    expect(
      interfaceFields(
        "export interface ScreeningCriterion {\n  id: string;\n  text: string;\n  plain?: string;\n}",
        "ScreeningCriterion",
      ),
    ).toEqual(["id", "text", "plain"]);
  });
});

/** The field names of an interface, in order, from its source. */
function interfaceFields(source: string, name: string): string[] {
  const body = stripComments(source).match(
    new RegExp(`interface\\s+${name}\\s*\\{([^}]*)\\}`),
  )?.[1];
  if (body === undefined) {
    throw new Error(`no interface ${name}`);
  }
  return [...body.matchAll(/^\s*(\w+)\??\s*:/gm)].flatMap((m) =>
    m[1] === undefined ? [] : [m[1]],
  );
}

/**
 * Test files share a module cache (`isolate: false` in vitest.config.ts, slice
 * 0006). That is safe only while no test replaces a module or a global, since
 * the replacement would leak into whichever file runs next in the worker.
 */
function replacesShared(source: string): boolean {
  return /\bvi\.(mock|doMock|stubGlobal|stubEnv|spyOn|useFakeTimers)\s*\(/.test(
    stripComments(source),
  );
}

describe("tests can share modules", () => {
  const TESTS_DIR = fileURLToPath(new URL(".", import.meta.url));
  const testFiles = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = resolve(dir, entry.name);
      return entry.isDirectory() ? testFiles(path) : path.endsWith(".test.ts") ? [path] : [];
    });

  it("has no test replacing a module or a global", () => {
    const files = testFiles(TESTS_DIR);
    expect(files.length).toBeGreaterThanOrEqual(40);
    // This file is left out: its own proofs below are strings that name the calls.
    const others = files.filter((f) => !f.endsWith(`${sep}boundary.test.ts`));
    expect(others.filter((f) => replacesShared(readFileSync(f, "utf8")))).toEqual([]);
  });

  it("would catch one", () => {
    expect(replacesShared('vi.mock("../src/models/omlx.js");')).toBe(true);
    expect(replacesShared("vi.spyOn(console, 'log');")).toBe(true);
    expect(replacesShared("const x = new FakeModelAdapter();")).toBe(false);
  });
});
