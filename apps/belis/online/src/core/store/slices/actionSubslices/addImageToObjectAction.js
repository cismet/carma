import { v4 as uuidv4 } from 'uuid';

import { getJWT, getLoginFromJWT } from '../auth';
import { addIntermediateResult, getDB } from '../offlineActionDb';

const addImageToObjectAction = (addImageParameter) => {
  return async (dispatch, getState) => {
    const state = getState();
    const offlineActionDb = getDB(state);
    const jwt = getJWT(state);
    const login = getLoginFromJWT(jwt);
    offlineActionDb.actions.insert({
      id: uuidv4(),
      action: 'uploadDocument',
      jwt: jwt,
      parameter: JSON.stringify(addImageParameter),
      isCompleted: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      applicationId: login + '@belis',
    });

    const intermediateResult = {
      object_type: addImageParameter.objekt_typ,
      object_id: addImageParameter.objekt_id,
      data: {
        imageData: addImageParameter.ImageData,
        ending: addImageParameter.ending,
        prefix: addImageParameter.prefix,
        description: addImageParameter.description,
      },
      ts: addImageParameter.ts,
      action: 'uploadDocument',
      resultType: 'image',
    };

    //add parameterInfo to intermediateResults
    dispatch(addIntermediateResult(intermediateResult));
  };
};

export default addImageToObjectAction;
