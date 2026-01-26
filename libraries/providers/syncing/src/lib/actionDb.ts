import { createRxDatabase, addRxPlugin, RxDatabase } from "rxdb";
import { getRxStorageDexie } from "rxdb/plugins/storage-dexie";
import { replicateGraphQL } from "rxdb/plugins/replication-graphql";
import { RxDBUpdatePlugin } from "rxdb/plugins/update";
import { RxDBQueryBuilderPlugin } from "rxdb/plugins/query-builder";
import { actionSchema } from "./schema";
import type {
  SyncConfig,
  ActionDocument,
  ActionDocumentWithDeleted,
} from "./types";

addRxPlugin(RxDBUpdatePlugin);
addRxPlugin(RxDBQueryBuilderPlugin);

const LOG_PREFIX = "[RxDB-Sync]";

function log(...args: unknown[]) {
  console.log(LOG_PREFIX, ...args);
}

function logError(...args: unknown[]) {
  console.error(LOG_PREFIX, ...args);
}

const dbInstances: Map<string, RxDatabase> = new Map();

export async function getDb(
  config: SyncConfig,
  login: string
): Promise<RxDatabase> {
  const key = `${config.appId}_${config.dbVersion}_${login.toLowerCase()}`;
  const dbName = `actiondb_${key}`;

  const existing = dbInstances.get(dbName);
  if (existing) {
    log("Returning existing database instance:", dbName);
    return existing;
  }

  log("Creating new RxDB database:", dbName);

  try {
    const db = await createRxDatabase({
      name: dbName,
      storage: getRxStorageDexie(),
      multiInstance: true,
      ignoreDuplicate: true,
    });

    log("Database created, adding collections...");

    await db.addCollections({
      actions: { schema: actionSchema },
    });

    log("Collections added successfully");

    dbInstances.set(dbName, db);
    return db;
  } catch (error) {
    logError("Failed to create database:", error);
    throw error;
  }
}

export function setupReplication(
  db: RxDatabase,
  config: SyncConfig,
  jwt: string,
  userId: string,
  onUpdate?: (action: ActionDocument) => void,
  onError?: (error: unknown) => void
) {
  const { httpUrl, wsUrl, appId } = config;
  const applicationId = `${userId}@${appId}`;

  log("Setting up GraphQL replication...");
  log("  HTTP URL:", httpUrl);
  log("  WS URL:", wsUrl);
  log("  Application ID:", applicationId);

  const replicationState = replicateGraphQL({
    replicationIdentifier: `${appId}-sync-${applicationId}`,
    collection: db.collections.actions,
    url: {
      http: httpUrl,
      ws: wsUrl,
    },
    headers: {
      Authorization: `Bearer ${jwt}`,
    },
    push: {
      batchSize: 1,
      queryBuilder: (docs) => {
        log("PUSH: Sending", docs.length, "document(s) to server");
        docs.forEach((d, i) => {
          log(
            `  [${i}] id=${d.newDocumentState.id}, action=${d.newDocumentState.action}`
          );
        });

        return {
          query: `
            mutation InsertAction($action: [action_insert_input!]!) {
              insert_action(
                objects: $action,
                on_conflict: {
                  constraint: action_pkey,
                  update_columns: [jwt, applicationId, isCompleted, action, parameter, result, updatedAt]
                }
              ) { affected_rows }
            }
          `,
          variables: { action: docs.map((d) => d.newDocumentState) },
        };
      },
      responseModifier: async (data) => {
        const hasErrors = JSON.stringify(data).includes("errors");
        if (hasErrors) {
          logError("PUSH: Server returned errors:", data);
          return data;
        }
        log(
          "PUSH: Success, affected rows:",
          (data as Record<string, unknown>)?.insert_action
        );
        return [];
      },
    },
    pull: {
      batchSize: 5,
      queryBuilder: (checkpoint) => {
        const cp = checkpoint as { updatedAt?: string } | null;
        const lastUpdate = cp?.updatedAt || new Date(0).toISOString();

        return {
          query: `{
            action(
              where: {
                _and: [
                  {updatedAt: {_gt: "${lastUpdate}"}},
                  {applicationId: {_eq: "${applicationId}"}},
                  {deleted: {_eq: false}}
                ]
              },
              limit: 5,
              order_by: [{updatedAt: asc}, {id: asc}]
            ) {
              id jwt isCompleted applicationId createdAt updatedAt
              action parameter result status deleted
            }
          }`,
          variables: {},
        };
      },
      responseModifier: async (
        response: unknown,
        _origin: unknown,
        checkpoint: unknown
      ) => {
        const rawDocs = response as Record<string, unknown>[];
        if (rawDocs.length > 0) {
          log("PULL: Received", rawDocs.length, "document(s)");
        }

        const docs: ActionDocumentWithDeleted[] = rawDocs.map((d) => {
          const doc = {
            id: d.id as string,
            jwt: d.jwt as string,
            createdAt: d.createdAt as string,
            updatedAt: d.updatedAt as string,
            applicationId: d.applicationId as string,
            isCompleted: d.isCompleted as boolean,
            action: d.action as string,
            parameter: d.parameter as string,
            result: d.result === null ? undefined : (d.result as string),
            status: d.status === null ? undefined : (d.status as number),
            _deleted: (d.deleted as boolean) || false,
          };
          log(
            "xxx PULL doc:",
            doc.id,
            "isCompleted:",
            doc.isCompleted,
            "result:",
            doc.result ? "yes" : "no"
          );
          return doc;
        });

        const last = docs[docs.length - 1];
        return {
          documents: docs,
          checkpoint: last
            ? { id: last.id, updatedAt: last.updatedAt }
            : checkpoint,
        };
      },
    },
    live: true,
    deletedField: "deleted",
    retryTime: 6000,
  });

  replicationState.active$.subscribe(() => {
    // Silent - only log errors
  });

  replicationState.error$.subscribe((err) => {
    logError("Replication error:", err);
    onError?.(err);
  });

  replicationState.received$.subscribe((action: ActionDocument) => {
    log(
      "RECEIVED: Action from server:",
      action.id,
      "isCompleted:",
      action.isCompleted,
      "result:",
      action.result ? "yes" : "no"
    );

    // Notify when action is completed (has result or isCompleted flag)
    if (action.result || action.isCompleted) {
      log("  -> Action completed, notifying callback");
      onUpdate?.(action);

      // Also ensure local document is marked as completed
      db.collections.actions
        .findOne({ selector: { id: action.id } })
        .exec()
        .then(
          (
            act: {
              incrementalModify: (
                fn: (data: ActionDocument) => ActionDocument
              ) => void;
            } | null
          ) => {
            if (act) {
              act.incrementalModify((data: ActionDocument) => ({
                ...data,
                isCompleted: true,
              }));
              log("  -> Action marked complete locally:", action.id);
            }
          }
        );
    }
  });

  replicationState.sent$.subscribe((docs: unknown) => {
    log(
      "SENT: Documents pushed to server:",
      Array.isArray(docs) ? docs.length : 1
    );
  });

  // Set up polling interval for periodic resync (like belis-online)
  const pollInterval = setInterval(() => {
    replicationState.reSync();
  }, 5000);

  log("Replication state initialized");
  log("  - Live mode: enabled");
  log("  - Retry time: 6000ms");
  log("  - Poll interval: 5000ms");

  // Extend replicationState to include interval cleanup on cancel
  const originalCancel = replicationState.cancel.bind(replicationState);
  replicationState.cancel = () => {
    log("Cancelling replication and clearing poll interval");
    clearInterval(pollInterval);
    return originalCancel();
  };

  return replicationState;
}

export function destroyDb(config: SyncConfig, login: string) {
  const key = `${config.appId}_${config.dbVersion}_${login.toLowerCase()}`;
  const dbName = `actiondb_${key}`;
  const db = dbInstances.get(dbName);

  if (db) {
    log("Destroying database instance:", dbName);
    db.destroy();
    dbInstances.delete(dbName);
  }
}
