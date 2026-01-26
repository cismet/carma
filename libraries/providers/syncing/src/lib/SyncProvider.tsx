import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  ReactNode,
} from "react";
import { v4 as uuidv4 } from "uuid";
import { RxDatabase } from "rxdb";
import { getDb, setupReplication } from "./actionDb";
import type {
  SyncConfig,
  SyncStatus,
  TaskItem,
  ActionPayload,
  TaskItemFormatter,
  ActionDocument,
} from "./types";

const LOG_PREFIX = "[SyncProvider]";

// Default task formatter
const defaultTaskFormatter: TaskItemFormatter = (doc, params) => {
  let actionStatus: TaskItem["actionStatus"] = "unknown";
  if (
    params.status === "open" ||
    params.status === "done" ||
    params.status === "exception"
  ) {
    actionStatus = params.status as TaskItem["actionStatus"];
  }

  return {
    actionStatus,
    fachobjekt: params.fk_tree
      ? `Baum ${params.fk_tree}`
      : params.object_name
      ? String(params.object_name)
      : "Objekt",
    beschreibung:
      (params.description as string) ||
      (params.status_reason as string) ||
      doc.action,
  };
};

// Convert RxDB action to display task
function actionToTask(
  doc: ActionDocument,
  formatter: TaskItemFormatter
): TaskItem {
  let params: Record<string, unknown> = {};
  try {
    params = JSON.parse(doc.parameter || "{}");
  } catch {
    // ignore
  }

  const formatted = formatter(doc, params);

  return {
    id: doc.id,
    action: doc.action,
    actionStatus: formatted.actionStatus,
    datum: doc.updatedAt || doc.createdAt,
    fachobjekt: formatted.fachobjekt,
    beschreibung: formatted.beschreibung,
    statusCode: doc.status,
    isCompleted: doc.isCompleted,
  };
}

export type ActionCompleteCallback = (action: ActionDocument) => void;

interface SyncContextValue {
  status: SyncStatus;
  tasks: TaskItem[];
  syncedAction: (
    actionName: string,
    payload: ActionPayload,
    onComplete?: ActionCompleteCallback
  ) => Promise<string>;
  resync: () => void;
  downloadTasks: () => void;
}

const SyncContext = createContext<SyncContextValue | null>(null);

interface SyncProviderProps {
  children: ReactNode;
  config: SyncConfig;
  jwt: string | null;
  login: string | null;
  taskFormatter?: TaskItemFormatter;
}

export function SyncProvider({
  children,
  config,
  jwt,
  login,
  taskFormatter = defaultTaskFormatter,
}: SyncProviderProps) {
  const [db, setDb] = useState<RxDatabase | null>(null);
  const [replicationState, setReplicationState] = useState<ReturnType<
    typeof setupReplication
  > | null>(null);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [status, setStatus] = useState<SyncStatus>({
    isReady: false,
    isConnected: false,
    pendingCount: 0,
    lastError: null,
  });

  // Store callbacks for actions waiting for completion
  const actionCallbacksRef = useRef<Map<string, ActionCompleteCallback>>(
    new Map()
  );

  // Initialize database and replication when jwt/login are available
  useEffect(() => {
    if (!jwt || !login) {
      console.log(LOG_PREFIX, "No JWT or login, skipping sync initialization");
      setStatus((s) => ({ ...s, isReady: false, isConnected: false }));
      return;
    }

    let cancelled = false;
    let replState: ReturnType<typeof setupReplication> | null = null;

    (async () => {
      try {
        console.log(LOG_PREFIX, "Initializing sync for user:", login);

        const database = await getDb(config, login);
        if (cancelled) return;

        setDb(database);
        console.log(LOG_PREFIX, "Database ready");

        // Setup replication
        replState = setupReplication(
          database,
          config,
          jwt,
          login,
          // onUpdate callback - called when an action completes on the server
          (action) => {
            console.log(LOG_PREFIX, "Action completed:", action.id);
            // Look up and call any registered callback for this action
            const callback = actionCallbacksRef.current.get(action.id);
            if (callback) {
              console.log(
                LOG_PREFIX,
                "Invoking completion callback for:",
                action.id
              );
              try {
                callback(action);
              } catch (err) {
                console.error(LOG_PREFIX, "Error in action callback:", err);
              }
              // Clean up after calling
              actionCallbacksRef.current.delete(action.id);
            } else {
              console.log(
                LOG_PREFIX,
                "xxx No callback found for action:",
                action.id,
                "registered callbacks:",
                [...actionCallbacksRef.current.keys()]
              );
            }
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

        // Track if sync is working based on successful operations
        replState.sent$.subscribe(() => {
          setStatus((s) => ({ ...s, isConnected: true }));
        });

        replState.received$.subscribe(() => {
          setStatus((s) => ({ ...s, isConnected: true }));
        });

        // Mark as connected initially if replication starts without error
        setStatus((s) => ({ ...s, isConnected: true }));

        // Subscribe to actions collection for task list
        const applicationId = `${login}@${config.appId}`;
        const query = database.collections.actions
          .find()
          .where("applicationId")
          .eq(applicationId)
          .sort({ createdAt: "desc" });

        query.$.subscribe((results: ActionDocument[]) => {
          // Fallback: invoke callbacks for completed actions that were missed by received$
          // This handles the multi-tab scenario where another tab pulled the completed action
          results.forEach((doc) => {
            if (
              (doc.result || doc.isCompleted) &&
              actionCallbacksRef.current.has(doc.id)
            ) {
              console.log(
                LOG_PREFIX,
                "Invoking callback via task list fallback for:",
                doc.id
              );
              const callback = actionCallbacksRef.current.get(doc.id);
              if (callback) {
                try {
                  callback(doc);
                } catch (err) {
                  console.error(LOG_PREFIX, "Error in fallback callback:", err);
                }
                actionCallbacksRef.current.delete(doc.id);
              }
            }
          });

          const taskList = results.map((doc) =>
            actionToTask(doc, taskFormatter)
          );
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
        console.log(
          LOG_PREFIX,
          "xxx Cancelling replication, pending callbacks:",
          actionCallbacksRef.current.size,
          "ids:",
          [...actionCallbacksRef.current.keys()]
        );
        replState.cancel();
      }
    };
  }, [jwt, login, config, taskFormatter]);

  // Synced action - supports multiple action types
  const syncedAction = useCallback(
    async (
      actionName: string,
      payload: ActionPayload,
      onComplete?: ActionCompleteCallback
    ): Promise<string> => {
      if (!db || !jwt || !login) {
        throw new Error("Sync not ready - database or auth not available");
      }

      const { appId } = config;
      const id = uuidv4();
      const now = new Date().toISOString();

      console.log(LOG_PREFIX, "Inserting action:", id, "type:", actionName);

      // Register callback if provided
      if (onComplete) {
        actionCallbacksRef.current.set(id, onComplete);
        console.log(
          LOG_PREFIX,
          "xxx Registered callback for action:",
          id,
          "total callbacks:",
          actionCallbacksRef.current.size
        );
      }

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

      return id;
    },
    [db, jwt, login, config]
  );

  // Resync - restart replication
  const resync = useCallback(() => {
    if (replicationState) {
      replicationState.reSync();
    }
  }, [replicationState]);

  // Download tasks as JSON
  const downloadTasks = useCallback(async () => {
    if (!db) return;

    try {
      const allDocs = await db.collections.actions.find().exec();
      const data = allDocs.map((doc: { toJSON: () => unknown }) =>
        doc.toJSON()
      );
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${config.appId}-tasks-${new Date()
        .toISOString()
        .slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      console.log(LOG_PREFIX, "Tasks downloaded");
    } catch (error) {
      console.error(LOG_PREFIX, "Failed to download tasks:", error);
    }
  }, [db, config.appId]);

  const value: SyncContextValue = {
    status,
    tasks,
    syncedAction,
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

export function useSyncOptional() {
  return useContext(SyncContext);
}
