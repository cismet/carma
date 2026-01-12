import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from "react";
import { v4 as uuidv4 } from "uuid";
import { RxDatabase } from "rxdb";
import { getDb, setupReplication, destroyDb } from "./actionDb";
import { APP_CONFIG } from "../../config/appConfig";

const LOG_PREFIX = "[SyncProvider]";

export interface TreeActionPayload {
  key: string;
  status: "open" | "done" | "exception";
  payload: {
    pic?: string;
    user: string;
  };
  created_at: string;
  action_time: string;
  description: string;
  status_reason: string;
  fk_tree: number;
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
  datum: string;
  fachobjekt: string;
  beschreibung: string;
  statusCode?: number;
  isCompleted: boolean;
}

interface SyncContextValue {
  status: SyncStatus;
  tasks: TaskItem[];
  uploadTreeAction: (payload: TreeActionPayload) => Promise<string>;
  resync: () => void;
  downloadTasks: () => void;
}

const SyncContext = createContext<SyncContextValue | null>(null);

interface SyncProviderProps {
  children: ReactNode;
  jwt: string | null;
  login: string | null;
}

// Convert RxDB action to display task
function actionToTask(doc: any): TaskItem {
  let params: any = {};
  try {
    params = JSON.parse(doc.parameter || "{}");
  } catch (e) {
    // ignore
  }

  return {
    id: doc.id,
    action: doc.action,
    datum: doc.updatedAt || doc.createdAt,
    fachobjekt: params.fk_tree ? `Baum ${params.fk_tree}` : "Baum",
    beschreibung: params.description || params.status_reason || doc.action,
    statusCode: doc.status,
    isCompleted: doc.isCompleted,
  };
}

export function SyncProvider({ children, jwt, login }: SyncProviderProps) {
  const [db, setDb] = useState<RxDatabase | null>(null);
  const [replicationState, setReplicationState] = useState<any>(null);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [status, setStatus] = useState<SyncStatus>({
    isReady: false,
    isConnected: false,
    pendingCount: 0,
    lastError: null,
  });

  // Initialize database and replication when jwt/login are available
  useEffect(() => {
    if (!jwt || !login) {
      console.log(LOG_PREFIX, "No JWT or login, skipping sync initialization");
      setStatus((s) => ({ ...s, isReady: false, isConnected: false }));
      return;
    }

    let cancelled = false;
    let replState: any = null;

    (async () => {
      try {
        console.log(LOG_PREFIX, "Initializing sync for user:", login);

        const database = await getDb(login);
        if (cancelled) return;

        setDb(database);
        console.log(LOG_PREFIX, "Database ready");

        // Setup replication
        replState = setupReplication(
          database,
          jwt,
          login,
          // onUpdate callback
          (action) => {
            console.log(LOG_PREFIX, "Action completed:", action.id);
            updatePendingCount(database);
          },
          // onError callback
          (error) => {
            console.error(LOG_PREFIX, "Sync error:", error);
            setStatus((s) => ({
              ...s,
              lastError: String(error),
              isConnected: false,
            }));
          }
        );

        setReplicationState(replState);

        // Subscribe to active state
        replState.active$.subscribe((active: boolean) => {
          console.log(LOG_PREFIX, "Connection active:", active);
          setStatus((s) => ({ ...s, isConnected: active }));
        });

        // Subscribe to actions collection for task list
        const { appId } = APP_CONFIG.sync;
        const applicationId = `${login}@${appId}`;
        const query = database.collections.actions
          .find()
          .where("applicationId")
          .eq(applicationId)
          .sort({ createdAt: "desc" });

        query.$.subscribe((results: any[]) => {
          console.log(LOG_PREFIX, "Tasks updated:", results.length);
          const taskList = results.map(actionToTask);
          setTasks(taskList);
          setStatus((s) => ({
            ...s,
            pendingCount: results.filter((r) => !r.isCompleted).length,
          }));
        });

        setStatus((s) => ({ ...s, isReady: true, lastError: null }));
        console.log(LOG_PREFIX, "Sync initialization complete");
      } catch (error) {
        console.error(LOG_PREFIX, "Failed to initialize sync:", error);
        setStatus((s) => ({
          ...s,
          isReady: false,
          lastError: String(error),
        }));
      }
    })();

    return () => {
      cancelled = true;
      if (replState) {
        console.log(LOG_PREFIX, "Cancelling replication");
        replState.cancel();
      }
    };
  }, [jwt, login]);

  // Helper to update pending count
  const updatePendingCount = async (database: RxDatabase) => {
    try {
      const pending = await database.collections.actions
        .find({ selector: { isCompleted: false } })
        .exec();
      setStatus((s) => ({ ...s, pendingCount: pending.length }));
    } catch (e) {
      console.error(LOG_PREFIX, "Failed to get pending count:", e);
    }
  };

  // Upload tree action
  const uploadTreeAction = useCallback(
    async (payload: TreeActionPayload): Promise<string> => {
      if (!db || !jwt || !login) {
        throw new Error("Sync not ready - database or auth not available");
      }

      const { appId, actionName } = APP_CONFIG.sync;
      const id = uuidv4();
      const now = new Date().toISOString();

      console.log(LOG_PREFIX, "Inserting tree action:", id);
      console.log(LOG_PREFIX, "  Payload:", JSON.stringify(payload, null, 2));

      await db.collections.actions.insert({
        id,
        action: actionName,
        jwt,
        parameter: JSON.stringify(payload),
        isCompleted: false,
        createdAt: now,
        updatedAt: now,
        applicationId: `${login}@${appId}`,
      });

      console.log(LOG_PREFIX, "Action inserted successfully:", id);

      // Update pending count
      await updatePendingCount(db);

      return id;
    },
    [db, jwt, login]
  );

  // Resync - restart replication
  const resync = useCallback(() => {
    if (replicationState) {
      console.log(LOG_PREFIX, "Triggering resync");
      replicationState.reSync();
    }
  }, [replicationState]);

  // Download tasks as JSON
  const downloadTasks = useCallback(async () => {
    if (!db) return;

    try {
      const allDocs = await db.collections.actions.find().exec();
      const data = allDocs.map((doc: any) => doc.toJSON());
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tzb-tasks-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      console.log(LOG_PREFIX, "Tasks downloaded");
    } catch (error) {
      console.error(LOG_PREFIX, "Failed to download tasks:", error);
    }
  }, [db]);

  const value: SyncContextValue = {
    status,
    tasks,
    uploadTreeAction,
    resync,
    downloadTasks,
  };

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync() {
  const ctx = useContext(SyncContext);
  if (!ctx) {
    throw new Error("useSync must be used within SyncProvider");
  }
  return ctx;
}

// Hook for components that might not have sync available
export function useSyncOptional() {
  return useContext(SyncContext);
}
