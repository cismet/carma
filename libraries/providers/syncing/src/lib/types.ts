export interface SyncConfig {
  httpUrl: string;
  wsUrl: string;
  appId: string;
  dbVersion: string;
  actionName?: string; // Optional - kept for backward compatibility
}

export interface ActionDocument {
  id: string;
  jwt: string;
  createdAt: string;
  updatedAt: string;
  applicationId: string;
  isCompleted: boolean;
  action: string;
  parameter: string;
  result?: string;
  status?: number;
}

export interface ActionDocumentWithDeleted extends ActionDocument {
  _deleted: boolean;
}

export interface ActionPayload {
  [key: string]: unknown;
}

export interface SyncStatus {
  isReady: boolean;
  isConnected: boolean;
  pendingCount: number;
  lastError: string | null;
}

export interface TaskItem {
  id: string;
  action: string;
  actionStatus:
    | "open"
    | "done"
    | "exception"
    | "unknown"
    | "createObject"
    | "editObject"
    | "deleteObject";
  datum: string;
  fachobjekt: string;
  beschreibung: string;
  statusCode?: number;
  isCompleted: boolean;
}

export interface TaskItemFormatter {
  (doc: ActionDocument, params: Record<string, unknown>): {
    actionStatus: TaskItem["actionStatus"];
    fachobjekt: string;
    beschreibung: string;
  };
}
