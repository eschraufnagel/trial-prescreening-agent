/**
 * Public surface of the models module. The only place in this project where a
 * model is called.
 *
 * `tests/boundary.test.ts` admits files under `src/models/` to `fetch()`:
 * oMLX on loopback, and each of three frontier hosts in its own named file.
 * The frontier adapter classes are deliberately not exported. Anything outside
 * this module gets an adapter from `createLocalAdapter`, `createAppAdapter`
 * (the running app's, slice 0017) or `createAdapter`, and the last two build a
 * frontier adapter only inside the budget wrapper.
 */
export { type Budget, BudgetPool, isBudgetStop, type Spent } from "./budget.js";
export {
  admittedModels,
  type CatalogEntry,
  catalogEntry,
  DEFAULT_MODEL_FOR,
  descriptorFor,
  PRICES_AS_OF,
  PROVIDER_NAMES,
  PROVIDERS,
  type Provider,
} from "./catalog.js";
export {
  DEFAULT_BASE_URL,
  DEFAULT_MODEL,
  type LocalSettings,
  loopbackProblems,
  normalizeBaseUrl,
  type OmlxConfig,
  readOmlxConfig,
  withLocalSettings,
} from "./config.js";
export { describeSettings, unsetReasons } from "./describe.js";
export { isConnectionFailure, isRefusal } from "./errors.js";
export {
  CHARS_PER_TOKEN,
  type Estimate,
  type EstimateLabel,
  estimate,
  formatEstimate,
  formatUsd,
  tokensFor,
  type Workload,
} from "./estimate.js";
export {
  type AdapterOptions,
  type AppAdapterOptions,
  type AppChoice,
  type AppSaved,
  createAdapter,
  createAppAdapter,
  createLocalAdapter,
  type LocalAdapterOptions,
  spentBy,
} from "./factory.js";
export {
  FakeModelAdapter,
  type FakeModelOptions,
  type ScriptedResponse,
} from "./fake.js";
export { keyHint, type SavedKeys } from "./keys.js";
export {
  type LocalModels,
  listLocalModels,
  OmlxAdapter,
  type OmlxAdapterOptions,
  quantizationFrom,
  SEED,
  TEMPERATURE,
} from "./omlx.js";
export { redact } from "./redact.js";
export { formatSpec, isFrontier, type ModelSpec, parseModelSpec } from "./spec.js";
export { appendSpend, priceOf, type SpendRecord, spendSoFar } from "./spend.js";
export {
  type CompletionRequest,
  type CompletionResponse,
  type FinishReason,
  type ModelAdapter,
  type ModelDescriptor,
  ModelError,
  type ModelRunMetadata,
  monthStamp,
  type TokenUsage,
} from "./types.js";
