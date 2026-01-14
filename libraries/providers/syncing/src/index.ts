// Components
export {
  SyncProvider,
  useSync,
  useSyncOptional,
  type ActionCompleteCallback,
} from "./lib/SyncProvider";
export { default as TaskPanel } from "./lib/TaskPanel";

// Database utilities
export { getDb, setupReplication, destroyDb } from "./lib/actionDb";

// Schema
export { actionSchema } from "./lib/schema";

// Types
export type {
  SyncConfig,
  SyncStatus,
  TaskItem,
  ActionDocument,
  ActionDocumentWithDeleted,
  ActionPayload,
  TaskItemFormatter,
} from "./lib/types";
