import type { Provider } from "./catalog.js";
import { admittedModels, catalogEntry, DEFAULT_MODEL_FOR, PROVIDERS } from "./catalog.js";
import { ModelError } from "./types.js";

/**
 * Which model a role runs on, as written on the command line:
 * `omlx`, `omlx:<model>`, `anthropic`, `anthropic:<model>`, `openai[:model]`,
 * `xai[:model]`.
 *
 * A provider name alone means its cheapest admitted model. A frontier model
 * outside the catalog is refused here, before any estimate or key is looked
 * at.
 */
export type ModelSpec =
  | { provider: "omlx"; model?: string }
  | { provider: Provider; model: string };

export function parseModelSpec(text: string): ModelSpec {
  const trimmed = text.trim();
  const colon = trimmed.indexOf(":");
  const provider = colon === -1 ? trimmed : trimmed.slice(0, colon);
  const model = colon === -1 ? undefined : trimmed.slice(colon + 1);

  if (model !== undefined && model.length === 0) {
    throw new ModelError(`Cannot read model spec "${text}"`, [
      "nothing after the colon; name a model or leave the colon out",
    ]);
  }

  if (provider === "omlx") {
    return model === undefined ? { provider } : { provider, model };
  }

  if (!isProvider(provider)) {
    throw new ModelError(`Cannot read model spec "${text}"`, [
      `unknown provider "${provider}"; expected omlx, ${PROVIDERS.join(", ")}`,
    ]);
  }

  const chosen = model ?? DEFAULT_MODEL_FOR[provider];
  if (catalogEntry(provider, chosen) === undefined) {
    throw new ModelError(`Cannot use ${provider}:${chosen}`, [
      `not in the catalog (src/models/catalog.ts). Admitted for ${provider}: ` +
        `${admittedModels(provider).join(", ")}`,
      "adding a model means adding its price and rules there, in a commit that says why",
    ]);
  }
  return { provider, model: chosen };
}

export function formatSpec(spec: ModelSpec): string {
  return spec.model === undefined ? spec.provider : `${spec.provider}:${spec.model}`;
}

export function isFrontier(spec: ModelSpec): spec is { provider: Provider; model: string } {
  return spec.provider !== "omlx";
}

function isProvider(value: string): value is Provider {
  return (PROVIDERS as readonly string[]).includes(value);
}
