/**
 * Public surface of the local server: the conversation service, the app's
 * routes, and the one function that listens.
 */
export { type App, type AppOptions, configureApp, type SettingsRoutesOptions } from "./app.js";
export {
  ConversationService,
  type ConversationServiceOptions,
  type ConversationSummary,
  channelHistory,
  MODEL_UNAVAILABLE,
  RESTARTED,
  type RemoveOutcome,
  type ReviewLookup,
} from "./conversations.js";
export {
  type AgentSource,
  type ConnectionResult,
  ConversationModel,
  fixedAgent,
  localModels,
  settingsAgent,
  settingsParser,
  testConnection,
} from "./models.js";
export {
  type Caps,
  choiceKey,
  choiceName,
  DEFAULT_CAPS,
  type Estimates,
  SettingsError,
  type SettingsPatch,
  SettingsStore,
  type SettingsView,
} from "./settings.js";
export { LOOPBACK_HOST, type StartOptions, startServer } from "./start.js";
export {
  CONVERSATION_ID,
  ConversationStore,
  type PendingMessage,
  type SavedConversation,
} from "./store.js";
export {
  type AddedTrialRecord,
  RESTARTED_JOB,
  TrialStore,
} from "./trial-store.js";
export {
  countByType,
  pinnedDetail,
  pinnedRows,
  REFRESH_FAILED,
  type TrialAction,
  type TrialHost,
  TrialLibrary,
  type TrialsOptions,
} from "./trials.js";
export type {
  ConversationInspection,
  ConversationOrigin,
  ConversationReview,
  CriteriaSource,
  FinishedConversation,
  ServedStudy,
  StudyOrigin,
  TrialDetail,
  TrialRow,
  TrialState,
} from "./types.js";
