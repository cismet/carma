import { createRxDatabase, addRxPlugin, RxDatabase } from "rxdb";
import { getRxStorageDexie } from "rxdb/plugins/storage-dexie";
import { replicateGraphQL } from "rxdb/plugins/replication-graphql";
import { RxDBUpdatePlugin } from "rxdb/plugins/update";
import { RxDBQueryBuilderPlugin } from "rxdb/plugins/query-builder";
import { actionSchema, ActionDocument, ActionDocumentWithDeleted } from "./schema";
import { APP_CONFIG } from "../../config/appConfig";

addRxPlugin(RxDBUpdatePlugin);
addRxPlugin(RxDBQueryBuilderPlugin);

const LOG_PREFIX = "[RxDB-Sync]";

function log(...args: unknown[]) {
  console.log(LOG_PREFIX, ...args);
}

function logError(...args: unknown[]) {
  console.error(LOG_PREFIX, ...args);
}

let dbInstance: RxDatabase | null = null;

export async function getDb(login: string): Promise<RxDatabase> {
  const key = `${APP_CONFIG.sync.dbVersion}_${login.toLowerCase()}`;
  const dbName = `actiondb_${key}`;

  if (dbInstance) {
    log("Returning existing database instance:", dbName);
    return dbInstance;
  }

  log("Creating new RxDB database:", dbName);

  try {
    const db = await createRxDatabase({
      name: dbName,
      storage: getRxStorageDexie(),
      multiInstance: true,
    });

    log("Database created, adding collections...");

    await db.addCollections({
      actions: { schema: actionSchema },
    });

    log("Collections added successfully");

    dbInstance = db;
    return db;
  } catch (error) {
    logError("Failed to create database:", error);
    throw error;
  }
}

export function setupReplication(
  db: RxDatabase,
  jwt: string,
  userId: string,
  onUpdate?: (action: ActionDocument) => void,
  onError?: (error: unknown) => void
) {
  const { httpUrl, wsUrl, appId } = APP_CONFIG.sync;
  const applicationId = `${userId}@${appId}`;

  log("Setting up GraphQL replication...");
  log("  HTTP URL:", httpUrl);
  log("  WS URL:", wsUrl);
  log("  Application ID:", applicationId);

  const replicationState = replicateGraphQL({
    replicationIdentifier: `tzb-sync-${applicationId}`,
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
          log(`  [${i}] id=${d.newDocumentState.id}, action=${d.newDocumentState.action}`);
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
        log("PUSH: Success, affected rows:", (data as any)?.insert_action?.affected_rows);
        return [];
      },
    },
    pull: {
      batchSize: 5,
      queryBuilder: (checkpoint: any) => {
        const lastUpdate = checkpoint?.updatedAt || new Date(0).toISOString();
        log("PULL: Fetching actions since", lastUpdate);

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
      responseModifier: async (response: any, _origin: any, checkpoint: any) => {
        const rawDocs = response as any[];
        log("PULL: Received", rawDocs.length, "document(s)");

        // Convert to documents with _deleted field
        const docs: ActionDocumentWithDeleted[] = rawDocs.map((d: any) => {
          log(`  id=${d.id}, action=${d.action}, isCompleted=${d.isCompleted}`);
          return {
            id: d.id,
            jwt: d.jwt,
            createdAt: d.createdAt,
            updatedAt: d.updatedAt,
            applicationId: d.applicationId,
            isCompleted: d.isCompleted,
            action: d.action,
            parameter: d.parameter,
            result: d.result === null ? undefined : d.result,
            status: d.status === null ? undefined : d.status,
            _deleted: d.deleted || false,
          };
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

  // Subscribe to connection/sync events
  replicationState.active$.subscribe((active) => {
    log("Replication active:", active);
  });

  replicationState.error$.subscribe((err) => {
    logError("Replication error:", err);
    onError?.(err);
  });

  replicationState.received$.subscribe((action: any) => {
    log("RECEIVED: Action from server:", action.id, "isCompleted:", action.isCompleted);

    if (action.result && !action.isCompleted) {
      log("  -> Marking action as completed locally");
      db.collections.actions
        .findOne({ selector: { id: action.id } })
        .exec()
        .then((act: any) => {
          if (act) {
            act.incrementalModify((data: ActionDocument) => ({
              ...data,
              isCompleted: true,
            }));
            log("  -> Action marked complete:", action.id);
            onUpdate?.(action);
          }
        });
    }
  });

  replicationState.sent$.subscribe((docs: any) => {
    log("SENT: Documents pushed to server:", Array.isArray(docs) ? docs.length : 1);
  });

  // Log initial sync status
  log("Replication state initialized");
  log("  - Live mode: enabled");
  log("  - Retry time: 6000ms");

  return replicationState;
}

export function destroyDb() {
  if (dbInstance) {
    log("Destroying database instance");
    dbInstance.destroy();
    dbInstance = null;
  }
}
