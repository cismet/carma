import { createSlice } from '@reduxjs/toolkit';
import slugify from 'slugify';

import * as offlineDatabase from '../../commons/offlineActionDbHelper';
import { getTaskForAction } from '../../commons/taskHelper';
import actions from './actionSubslices';
import { getJWT, getLoginFromJWT } from './auth';
import {
  integrateIntermediateResultsIntofeatureCollection,
  setDone,
} from './featureCollection';
import { DB_VERSION } from '../../../constants/belis';

const initialState = { tasks: [], rawTasks: [], intermediateResults: {} };

const slice = createSlice({
  name: 'offlineActionDb',
  initialState,
  reducers: {
    storeDB(state, action) {
      state.db = action.payload;
      // return state;
    },
    storeRep(state, action) {
      state.rep = action.payload;
      // return state;
    },
    storeIntermediateResults(state, action) {
      state.intermediateResults = action.payload;

      return state;
    },
    setTasks(state, action) {
      state.tasks = action.payload;
      return state;
    },
    setRawTasks(state, action) {
      state.rawTasks = action.payload;
      return state;
    },
  },
});

export default slice;

export const { storeDB, storeIntermediateResults, storeRep } = slice.actions;

export const getDB = (state) => {
  return state.offlineActionDb.db;
};
export const getRep = (state) => {
  return state.offlineActionDb.rep;
};
export const getIntermediateResults = (state) => {
  return state.offlineActionDb.intermediateResults;
};

export const getTasks = (state) => {
  return state.offlineActionDb.tasks;
};
export const getRawTasks = (state) => {
  return state.offlineActionDb.rawTasks;
};
export const initialize = (storedJWT) => {
  return async (dispatch, getState) => {
    const state = getState();
    const jwt = storedJWT ? storedJWT : getJWT(state);
    const login = getLoginFromJWT(jwt);
    offlineDatabase
      .createDb(login)
      .then((d) => {
        if (d !== undefined) {
          let rep = new offlineDatabase.GraphQLReplicator(d);

          const errorCallback = (error) => {
            console.log('error occured', error);
          };
          const changeCallback = (action) => {
            // console.log("change occured", action);
          };
          const login = getLoginFromJWT(jwt);
          rep.restart(
            { userId: login + '@belis', idToken: jwt },
            errorCallback,
            changeCallback
          );

          dispatch(storeRep(rep));
          dispatch(storeDB(d));

          //database is ready will now establish a subsription for all stored tasks in the offline db

          const query = d.actions
            .find()
            .where('applicationId')
            .eq(login + '@belis')
            .sort({ createdAt: 'desc' });

          query.$.subscribe((results) => {
            const tasks = [];
            for (const result of results) {
              const task = getTaskForAction(result);
              tasks.push(task);
            }
            dispatch(slice.actions.setTasks(tasks));
            dispatch(slice.actions.setRawTasks(results));
          });
        } else {
          console.error('offline database not available', jwt);

          throw new Error('offline database not available', jwt);
        }
      })
      .catch((e) => {
        console.error('offline database not available', e);
        console.log('HIER IST WAS SCHIEF GELAUFEN');

        throw new Error('offline database not available', e);
      });
  };
};

export const reInitialize = (storedJWT) => {
  return async (dispatch, getState) => {
    const state = getState();
    const jwt = storedJWT ? storedJWT : getJWT(state);
    const oldRep = getRep(state);
    const login = getLoginFromJWT(jwt);
    const loginLowerCase = (login || '').toLowerCase();
    const d = window['db_' + DB_VERSION + '_' + loginLowerCase];

    if (oldRep) {
      oldRep.dispose();
    }

    let rep = new offlineDatabase.GraphQLReplicator(d);

    const errorCallback = (error) => {
      console.log('error occured', error);
    };
    const changeCallback = (action) => {
      console.log('change occured', action);
    };
    rep.restart(
      { userId: login + '@belis', idToken: jwt },
      errorCallback,
      changeCallback
    );
    dispatch(storeRep(rep));
    dispatch(storeDB(d));
    const query = d.actions
      .find()
      .where('applicationId')
      .eq(login + '@belis')
      .sort({ createdAt: 'desc' });
    query.$.subscribe((results) => {
      const tasks = [];
      for (const result of results) {
        const task = getTaskForAction(result);
        tasks.push(task);
      }
      dispatch(slice.actions.setTasks(tasks));
      dispatch(slice.actions.setRawTasks(results));
    });
  };
};

export const truncateActionTables = () => {
  return async (dispatch, getState) => {
    const state = getState();
    const db = getDB(state);

    if (db && db.actions) {
      dispatch(setDone(false));
      db.actions.remove();

      db.destroy().then((res) => {
        window['dbInit'] = undefined;
        dispatch(initialize());
        dispatch(setDone(true));
      });
    }
  };
};

export const resyncDb = (currentJwt) => {
  return async (dispatch, getState) => {
    const state = getState();
    const rep = getRep(state);

    if (rep) {
      const jwt = currentJwt ? currentJwt : getJWT(getState());

      const errorCallback = (error) => {
        console.log('error occured', error);
      };
      const changeCallback = (action) => {
        console.log('change occured', action);
      };

      const login = getLoginFromJWT(jwt);
      rep.restart(
        { userId: login + '@belis', idToken: jwt },
        errorCallback,
        changeCallback
      );
    }
  };
};

export const setSyncPoint = (time) => {
  const timeObj = time;

  return async (dispatch, getState) => {
    const state = getState();
    const rep = getRep(state);

    if (rep) {
      rep.setSyncPoint(timeObj);
    }
  };
};

export const clearIntermediateResults = (object_type) => {
  return async (dispatch, getState) => {
    if (object_type === 'arbeitsauftrag') {
      dispatch(clearIntermediateResults('arbeitsprotokoll'));
    }
    const stateIntermediateResults = getIntermediateResults(getState()) || {};
    let intermediateResultsCopy;
    if (stateIntermediateResults[object_type]) {
      if (!intermediateResultsCopy) {
        intermediateResultsCopy = JSON.parse(
          JSON.stringify(stateIntermediateResults)
        );
      }
      delete intermediateResultsCopy[object_type];
    }
    if (intermediateResultsCopy) {
      dispatch(storeIntermediateResults(intermediateResultsCopy));
    }
  };
};

export const addIntermediateResult = (intermediateResult) => {
  return async (dispatch, getState) => {
    // intermediate result has the following attributes
    // object_typ: class of the object
    // object_id: primary key of the object
    // data: the object itself (JSON)
    // in data for example in the add image action:
    //      imageData: the image data
    //      description: the description of the image
    //      ending: the ending of the image
    //      prefix: the prefix of the image
    //      ts: the timestamp of the image
    const stateIntermediateResults = getIntermediateResults(getState()) || {};
    const intermediateResults = JSON.parse(
      JSON.stringify(stateIntermediateResults)
    );

    if (!intermediateResults[intermediateResult.object_type]) {
      intermediateResults[intermediateResult.object_type] = {};
    }
    if (
      !intermediateResults[intermediateResult.object_type][
        intermediateResult.object_id
      ]
    ) {
      intermediateResults[intermediateResult.object_type][
        intermediateResult.object_id
      ] = {};
    }
    if (
      !intermediateResults[intermediateResult.object_type][
        intermediateResult.object_id
      ][intermediateResult.resultType]
    ) {
      intermediateResults[intermediateResult.object_type][
        intermediateResult.object_id
      ][intermediateResult.resultType] = [];
    }
    intermediateResults[intermediateResult.object_type][
      intermediateResult.object_id
    ][intermediateResult.resultType].push(intermediateResult.data);

    dispatch(storeIntermediateResults(intermediateResults));
    dispatch(
      integrateIntermediateResultsIntofeatureCollection(intermediateResults)
    );
  };
};
function downloadObjectAsJson(exportObj, exportName) {
  var dataStr =
    'data:text/json;charset=utf-8,' +
    encodeURIComponent(JSON.stringify(exportObj));
  var downloadAnchorNode = document.createElement('a');
  downloadAnchorNode.setAttribute('href', dataStr);
  downloadAnchorNode.setAttribute('download', exportName + '.json');
  document.body.appendChild(downloadAnchorNode); // required for firefox
  downloadAnchorNode.click();
  downloadAnchorNode.remove();
}

export const downloadTasks = () => {
  return async (dispatch, getState) => {
    const state = getState();
    const rawTasks = getRawTasks(state);
    console.log('will export' + rawTasks?.length + ' tasks');

    downloadObjectAsJson(
      rawTasks,
      'tasks' + slugify(new Date().toLocaleString())
    );
  };
};

// export const addImageToObjectAction = (addImageParameter) => {
//   return async (dispatch, getState) => {
//     const state = getState();
//     const offlineActionDb = getDB(state);
//     const jwt = getJWT(state);
//     const login = getLoginFromJWT(jwt);
//     offlineActionDb.actions.insert({
//       id: uuidv4(),
//       action: "uploadDocument",
//       jwt: jwt,
//       parameter: JSON.stringify(addImageParameter),
//       isCompleted: false,
//       createdAt: new Date().toISOString(),
//       updatedAt: new Date().toISOString(),
//       applicationId: login + "@belis",
//     });

//     console.log("added object to offline db to uploadDocument", addImageParameter);

//     const intermediateResult = {
//       object_type: addImageParameter.objekt_typ,
//       object_id: addImageParameter.objekt_id,
//       data: {
//         imageData: addImageParameter.ImageData,
//         ending: addImageParameter.ending,
//         prefix: addImageParameter.prefix,
//         description: addImageParameter.description,
//       },
//       ts: addImageParameter.ts,
//       action: "uploadDocument",
//       resultType: "image",
//     };

//     //add parameterInfo to intermediateResults
//     dispatch(addIntermediateResult(intermediateResult));
//   };
// };

export const { addImageToObjectAction } = actions;

export const uploadDocumemt = () => {};
