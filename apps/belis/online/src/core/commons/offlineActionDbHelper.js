import { addRxPlugin, createRxDatabase } from 'rxdb';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import { replicateGraphQL } from 'rxdb/plugins/replication-graphql';
import {
  OFFLINE_ACTIONS_ENDPOINT_URL,
  OFFLINE_ACTIONS_SYNC_URL,
  DB_VERSION,
} from '../../constants/belis';
import { actionSchema } from './schema';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { RxDBUpdatePlugin } from 'rxdb/plugins/update';
import { RxDBQueryBuilderPlugin } from 'rxdb/plugins/query-builder';
import { RxDBLeaderElectionPlugin } from 'rxdb/plugins/leader-election';

addRxPlugin(RxDBUpdatePlugin);
addRxPlugin(RxDBQueryBuilderPlugin);
addRxPlugin(RxDBLeaderElectionPlugin);

export const ERR_CODE_INVALID_JWT = 'invalid-jwt';
export const ERR_CODE_NO_CONNECTION = 'Failed to fetch';
const ERR_MSG_INVALID_JWT = 'Could not verify JWT';

const batchSize = 5;
const batchSizePush = 1;

const toTimeString = (dateObject) => {
  return (
    dateObject.getFullYear() +
    '-' +
    (dateObject.getMonth() + 1) +
    '-' +
    dateObject.getDate() +
    'T' +
    dateObject.getHours() +
    ':' +
    dateObject.getMinutes() +
    ':' +
    dateObject.getSeconds() +
    '.' +
    dateObject.getMilliseconds() +
    '+0' +
    dateObject.getTimezoneOffset() / -60 +
    ':00'
  );
};

const pushQueryBuilder = (doc) => {
  const query = `
        mutation InsertAction($action: [action_insert_input!]!) {
            insert_action(
                objects: $action,
                on_conflict: {
                    constraint: action_pkey,
                    update_columns: [jwt, applicationId, isCompleted, action, parameter, result, updatedAt]
                }){
                  affected_rows
            }
        }
     `;

  let acts = [];
  let i = 0;

  for (let action of doc) {
    acts[i] = action.newDocumentState;
    ++i;
  }
  const variables = {
    action: acts,
  };

  const operationName = 'InsertAction';

  return {
    query,
    variables,
    operationName,
  };
};

const syncUrls = {
  http: OFFLINE_ACTIONS_SYNC_URL,
  ws: OFFLINE_ACTIONS_ENDPOINT_URL,
};

export class GraphQLReplicator {
  constructor(db) {
    this.db = db;
    this.replicationState = null;
    this.subscriptionClient = null;
    this.temporarySyncTime = null;
  }

  pullQueryBuilder = (userId) => {
    return (doc, limitParam) => {
      if (!doc) {
        doc = {
          id: '',
          updatedAt: new Date(0).toUTCString(),
        };
      }
      let lastUpdate = doc.updatedAt;

      if (this.temporarySyncTime) {
        let dateObject = new Date(this.temporarySyncTime);

        lastUpdate = toTimeString(dateObject);

        this.temporarySyncTime = undefined;
      }

      if (!lastUpdate) {
        lastUpdate = new Date(0).toUTCString();
      }

      doc = {
        id: '',
        updatedAt: lastUpdate,
      };

      const query = `{
              action(
                  where: {
                      _and: [
                          {updatedAt: {_gt: "${lastUpdate}"}},
                          {applicationId: {_eq: "${userId}"}},
                          {deleted: {_eq: false}}
                      ]
                  },
                  limit: ${batchSize},
                  order_by: [{updatedAt: asc}, {id: asc}]
              ) {
                  id
                  jwt
                  isCompleted
                  applicationId
                  createdAt
                  updatedAt
                  action,
                  parameter,
                  result,
                  status,
                  deleted
              }
          }`;
      return {
        query,
        variables: {},
      };
    };
  };

  setSyncPoint(temporarySyncTime) {
    this.temporarySyncTime = temporarySyncTime;
  }

  dispose() {
    if (this.replicationState) {
      this.replicationState.cancel();
    }

    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

  async restart(auth, errorCallback, updateCallback) {
    if (this.replicationState) {
      this.replicationState.cancel();
    }

    // if (this.subscriptionClient) {
    //   this.subscriptionClient.close();
    // }

    this.replicationState = this.setupGraphQLReplication(
      auth,
      errorCallback,
      updateCallback
    );
  }

  errorHandling(err, callback) {
    let errorCode = null;

    if (err.message) {
      if (err.message instanceof String) {
        let msg = JSON.parse(err.message);

        if (Array.isArray(msg)) {
          errorCode = msg[0].extensions.code;
        }
      } else {
        errorCode = err.message;
      }
    }

    if (errorCode === null) {
      errorCode = err;
    }

    console.debug('error code:' + errorCode);

    if (
      errorCode.indexOf(ERR_MSG_INVALID_JWT) !== -1 ||
      errorCode === ERR_CODE_INVALID_JWT
    ) {
      if (callback) {
        callback(ERR_CODE_INVALID_JWT);
      }
    } else if (errorCode === ERR_CODE_NO_CONNECTION) {
      if (callback) {
        callback(ERR_CODE_NO_CONNECTION);
      }
    }
  }

  setupGraphQLReplication(auth, errorCallback, updateCallback) {
    const adb = this.db;
    // adb.waitForLeaderShip();

    const removeUnusedAction = (act) => {
      if (act) {
        act.remove();
      }
    };

    const reactOn401 = (act) => {
      if (act && act.status === 401) {
        const changeFunction = (oldData) => {
          oldData.jwt = auth.idToken;
          // when a value is null, the rxdb will throw an error
          oldData.result = undefined;
          oldData.status = undefined;
          return oldData;
        };
        //set the current jwt
        act.incrementalModify(changeFunction);
      }
    };

    const replicationState = replicateGraphQL({
      collection: adb.actions,
      url: syncUrls,
      headers: {
        /* optional, set an auth header */
        Authorization: `Bearer ${auth.idToken}`,
      },
      push: {
        batchSizePush,
        queryBuilder: pushQueryBuilder,
        responseModifier: async function (data) {
          if (JSON.stringify(data).indexOf('errors') !== -1) {
            return data;
          }

          //an empty array should be returned, if the push request was successful
          return [];
        },
      },
      pull: {
        batchSize,
        queryBuilder: this.pullQueryBuilder(auth.userId),
        includeWsHeaders: true,
        responseModifier: async function (
          plainResponse,
          origin,
          requestCheckpoint
        ) {
          const docs = plainResponse;
          let lastDoc = null;

          for (let action of docs) {
            lastDoc = action;

            //null values are not allowed, so they must be replaced by undefined
            if (lastDoc.result === null) {
              lastDoc.result = undefined;
            }
          }

          let retCheckpoint;

          if (lastDoc) {
            retCheckpoint = {
              id: lastDoc.id,
              updatedAt: lastDoc.updatedAt,
            };
          } else {
            retCheckpoint = requestCheckpoint;
          }

          return {
            documents: docs,
            checkpoint: retCheckpoint,
          };
        },
      },
      onConnect: (msg) => {
        console.log('SubscriptionClient.onConnect()');
      },
      connectionCallback: (err) => {
        if (err) {
          if (err === 'Could not verify JWT: JWSError JWSInvalidSignature') {
            console.log('cannot verify jwt');
            if (errorCallback) {
              errorCallback(ERR_CODE_INVALID_JWT);
            }
          }
        }
      },
      live: true,
      deletedField: 'deleted',
      retryTime: 6000,
    });

    replicationState.error$.subscribe((err) => {
      this.errorHandling(err, errorCallback);
      // replicationState.cancel();
    });

    replicationState.received$.subscribe((doc) => {
      console.dir(doc);

      let action = doc;
      if (action.deleted) {
        adb.actions
          .findOne({ selector: { id: action.id } })
          .exec()
          .then(removeUnusedAction);
      } else if (action.status === 401) {
        //wrong jwt was set
        adb.actions
          .findOne({ selector: { id: action.id } })
          .exec()
          .then(reactOn401);
      } else if (action.result && action.isCompleted === false) {
        const reactOnCompletedAction = (act) => {
          if (act && !act.isCompleted) {
            const changeFunction = (oldData) => {
              oldData.isCompleted = true;
              // when a value is null, the rxdb will throw an error
              if (oldData.result === null) {
                oldData.result = undefined;
              }
              if (oldData.status === null) {
                oldData.status = undefined;
              }

              if (oldData?.parameter?.ImageData) {
                oldData.parameter.ImageData = '!locallyStripped';
              }
              return oldData;
            };
            //set isCompelted to true
            act.incrementalModify(changeFunction);

            //call the callback function
            if (updateCallback != null) {
              updateCallback(action);
            }
          }
        };
        adb.actions
          .findOne({ selector: { id: action.id } })
          .exec()
          .then(reactOnCompletedAction);
      }
    });

    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    const refresh = () => {
      replicationState.emitEvent('RESYNC');
    };

    this.intervalId = setInterval(refresh, 5000);

    return replicationState;
  }
}

export const createDb = async (login) => {
  console.log('createDb(', login);
  //convert login to loewercase
  const loginLowerCase = (login || '').toLowerCase();
  if (window['db_' + DB_VERSION + '_' + loginLowerCase]) {
    return window['db_' + DB_VERSION + '_' + loginLowerCase];
  } else if (window['db_' + DB_VERSION + '_' + loginLowerCase + '___WAIT']) {
    let attempts = 0;
    do {
      await delay(1000);
      ++attempts;
    } while (
      window['db_' + DB_VERSION + '_' + loginLowerCase + '___WAIT'] &&
      attempts < 20
    );

    if (window['db_' + DB_VERSION + '_' + loginLowerCase]) {
      return window['db_' + DB_VERSION + '_' + loginLowerCase];
    }
  }

  window['db_' + DB_VERSION + '_' + loginLowerCase + '___WAIT'] = true;

  try {
    const db = await createRxDatabase({
      name: 'actiondb_' + DB_VERSION + '_' + loginLowerCase,
      storage: wrappedValidateAjvStorage({
        storage: getRxStorageDexie(),
      }),
      multiInstance: true,
    });

    let ready = true;
    let attempts = 0;

    do {
      try {
        ready = true;
        // sometimes, the method invocation db.collection(...) fails, because the db connection is closed,
        // but a retry solves this problem
        await db.addCollections({
          actions: { schema: actionSchema },
        });
        attempts += 1;
      } catch (exception) {
        ready = false;
        //wait one second and try it again
        await delay(1000);
      }
    } while (!ready && attempts < 3);

    window['db_' + DB_VERSION + '_' + loginLowerCase] = db; // write to window
    window['db_' + DB_VERSION + '_' + loginLowerCase + '___WAIT'] = undefined;

    return db;
  } catch (exception) {
    console.log('exception while creating db', exception);

    window['db_' + DB_VERSION + '_' + loginLowerCase + '___WAIT'] = undefined;
    return null;
  }
};

const delay = async (millis) =>
  new Promise((resolve, reject) => {
    setTimeout((_) => resolve(), millis);
  });
