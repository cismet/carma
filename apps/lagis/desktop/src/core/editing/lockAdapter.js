import wizardQueries from "../wizard/queries";
import { run, CLASS } from "../wizard/api";
import {
  deleteObject,
  fetchClassId,
  saveAndGetId,
} from "../wizard/cidsActions";

const toLock = (row) => ({
  id: row.id,
  userString: row.user_string,
  info: row.additional_info,
});

// LockAdapter of @carma-providers/locking on cids cs_locks; type = table name
export const cidsLockAdapter = (jwt) => ({
  listForObject: async ({ type, id }) => {
    const classId = await fetchClassId(type, jwt);
    const data = await run(
      wizardQueries.lockForObject,
      { classId, objectId: id },
      jwt
    );
    return (data.cs_locks ?? []).map(toLock);
  },

  listForObjects: async (type, ids) => {
    const classId = await fetchClassId(type, jwt);
    const data = await run(
      wizardQueries.locksForObjects,
      { classId, objectIds: ids },
      jwt
    );
    return (data.cs_locks ?? []).map((row) => ({
      ...toLock(row),
      objectId: Number(row.object_id),
    }));
  },

  listByUser: async (userString) => {
    const data = await run(wizardQueries.locksByUser, { userString }, jwt);
    return (data.cs_locks ?? []).map(toLock);
  },

  write: async ({ type, id }, userString, info) => {
    const classId = await fetchClassId(type, jwt);
    return saveAndGetId(
      CLASS.LOCK,
      {
        class_id: classId,
        object_id: id,
        user_string: userString,
        additional_info: info,
      },
      jwt
    );
  },

  remove: (lockId, options) =>
    deleteObject(CLASS.LOCK, { id: lockId }, jwt, options),
});
