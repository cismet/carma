import { v4 as uuidv4 } from 'uuid';

import { ADD_INCIDENT_MODES } from '../../../../components/app/dialogs/AddIncident';
import { getJWT, getLoginFromJWT } from '../auth';
import {
  loadTaskLists,
  MODES,
  setFeatureCollectionForMode,
  setMode,
} from '../featureCollection';
import { addIntermediateResult, getDB } from '../offlineActionDb';

const addIncidentAction = (params) => {
  return async (dispatch, getState) => {
    const state = getState();
    const offlineActionDb = getDB(state);
    const jwt = getJWT(state);
    const login = getLoginFromJWT(jwt);

    const offlineAction = {
      id: uuidv4(),
      action: 'addIncident',
      jwt: jwt,
      parameter: JSON.stringify(params),
      isCompleted: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      applicationId: login + '@belis',
    };

    offlineActionDb.actions.insert(offlineAction);

    console.log(
      'added object to offline db to addIncident',
      params,
      offlineAction
    );
    let intermediateResult;
    if (params.aktion === ADD_INCIDENT_MODES.VERANLASSUNG) {
      //nothing to do, because we don't show Veranlassung in the mobile application
    } else if (params.aktion === ADD_INCIDENT_MODES.EINZELAUFTRAG) {
      intermediateResult = {
        object_type: 'arbeitsauftrag',
        object_id: '*',
        data: {
          ...params,
        },
        ts: params.ts,
        action: 'uploadDocument',
        resultType: 'object',
      };
    } else if (params.aktion === ADD_INCIDENT_MODES.ADD2ARBEITSAUFTRAG) {
      intermediateResult = {
        object_type: 'arbeitsauftrag',
        object_id: params.arbeitsauftrag,
        data: {
          ...params,
        },
        ts: params.ts,
        action: 'uploadDocument',
        resultType: 'object',
      };
    }

    // //add parameterInfo to intermediateResults
    if (intermediateResult) {
      dispatch(addIntermediateResult(intermediateResult));

      //this will refresh the tasklist featurecollection and activates the sidebar with the newly created tasklist
      dispatch(
        loadTaskLists({
          done: () => {
            setTimeout(() => {
              dispatch(setMode(MODES.TASKLISTS));
              dispatch(setFeatureCollectionForMode(MODES.PROTOCOLS));
            }, 400);
          },
        })
      );
    }
  };
};

export default addIncidentAction;
