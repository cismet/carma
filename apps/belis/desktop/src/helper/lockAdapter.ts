import {
  createCidsClassIdLookup,
  formatLockInfo,
  parseLockInfo,
} from "@carma-providers/locking";
import type { Lock, LockAdapter, ObjectLock } from "@carma-providers/locking";
import { CLASSES_ENDPOINT, ENDPOINT } from "../constants/belis";
import store from "../store";
import { getJWT } from "../store/slices/auth";
import { removeDataByClassName, updateDataByClassName } from "./apiMethods";

// Like Java BelIS: one `sperre` row per user, every locked object is one
// entry of its `sperre_entityArray`. A lock id here is the sperre_entity id,
// so each object still has its own lock.

const LOCK_CLASS = "sperre";
const ENTITY_CLASS = "sperre_entity";
const LOCK_CONTEXT = "BelIS Desktop";

const classId = createCidsClassIdLookup(
  CLASSES_ENDPOINT,
  () => getJWT(store.getState()) as string | undefined
);

interface SperreEntity {
  id: number;
  class_id: number | string;
  object_id: number | string;
}

interface SperreRow {
  id: number;
  user_string: string;
  additional_info: string | null;
  sperre_entityArray?: SperreEntity[];
}

interface SperreRows {
  sperre?: SperreRow[];
}

// The BelIS GraphQL proxy ignores `where` on sperre and drops variable
// declarations, so all locks are loaded and filtered here. There are only
// as many rows as current locks.
const allLocksQuery = `query {
  sperre {
    id
    user_string
    additional_info
    sperre_entityArray {
      id
      class_id
      object_id
    }
  }
}`;

const entitiesOf = (row: SperreRow) => row.sperre_entityArray ?? [];

const toLock = (row: SperreRow, entity: SperreEntity): ObjectLock => ({
  id: Number(entity.id),
  userString: row.user_string,
  info: row.additional_info,
  objectId: Number(entity.object_id),
});

const locksOn = (
  rows: SperreRow[],
  classId: number,
  objectIds: Set<number>
): ObjectLock[] =>
  rows
    .flatMap((row) =>
      entitiesOf(row)
        .filter(
          (entity) =>
            Number(entity.class_id) === classId &&
            objectIds.has(Number(entity.object_id))
        )
        .map((entity) => toLock(row, entity))
    )
    .sort((a, b) => a.id - b.id);

const loadLocks = async (jwt: string) => {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({ query: allLocksQuery }),
  });
  if (!response.ok) {
    throw new Error(`sperre query failed: ${String(response.status)}`);
  }
  const json = (await response.json()) as {
    data?: SperreRows;
    errors?: unknown;
  };
  if (json.errors || !json.data) {
    throw new Error(`sperre query failed: ${JSON.stringify(json.errors)}`);
  }
  return json.data.sperre ?? [];
};

const isSessionRow = (row: SperreRow, userString: string) =>
  row.user_string === userString &&
  parseLockInfo(row.additional_info)?.context === LOCK_CONTEXT;

// "Standort 1;-;<time>;Chrome" → "BelIS Desktop;-;<time>;Chrome": the row
// holds all objects, the label of one would be wrong
const sessionInfo = (info: string) => {
  const parsed = parseLockInfo(info);
  return formatLockInfo({
    context: LOCK_CONTEXT,
    object: "-",
    time: parsed?.time ?? "",
    ...(parsed?.client ? { client: parsed.client } : {}),
  });
};

// Writes and removes run one at a
// time; otherwise parallel drafts could each create their own sperre.
let queue: Promise<unknown> = Promise.resolve();
const serialized = <T>(task: () => Promise<T>) => {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
};

const addEntity = async (
  jwt: string,
  type: string,
  objectId: number,
  userString: string,
  info: string
) => {
  const lockClassId = await classId(type);
  const own = (await loadLocks(jwt)).find((row) =>
    isSessionRow(row, userString)
  );
  const before = new Set(
    (own ? entitiesOf(own) : []).map((entity) => Number(entity.id))
  );
  if (own) {
    // a nested save of an existing sperre drops its other entities
    await updateDataByClassName(jwt, ENTITY_CLASS, {
      id: -1,
      class_id: lockClassId,
      object_id: objectId,
      fk_sperre: own.id,
    });
  } else {
    await updateDataByClassName(jwt, LOCK_CLASS, {
      id: -1,
      user_string: userString,
      additional_info: sessionInfo(info),
      // SaveObject expects epoch ms, a string ends up as 1970-01-01
      lock_timestamp: Date.now(),
      // SaveObject names the 1:n relation <array>RelationShip
      sperre_entityArrayRelationShip: [
        { id: -2, class_id: lockClassId, object_id: objectId },
      ],
    });
  }
  const added = (await loadLocks(jwt))
    .filter((row) => isSessionRow(row, userString))
    .flatMap(entitiesOf)
    .filter(
      (entity) =>
        !before.has(Number(entity.id)) &&
        Number(entity.class_id) === lockClassId &&
        Number(entity.object_id) === objectId
    )
    .map((entity) => Number(entity.id))
    .sort((a, b) => a - b)
    .pop();
  if (added === undefined) {
    throw new Error(
      "Die Sperre wurde ohne gesperrtes Objekt gespeichert (sperre_entity fehlt)."
    );
  }
  return added;
};

const removeEntity = async (jwt: string, entityId: number) => {
  const row = (await loadLocks(jwt)).find((candidate) =>
    entitiesOf(candidate).some((entity) => Number(entity.id) === entityId)
  );
  if (!row) {
    return;
  }
  await removeDataByClassName(jwt, ENTITY_CLASS, { id: entityId });
  if (entitiesOf(row).length === 1) {
    await removeDataByClassName(jwt, LOCK_CLASS, { id: row.id });
  }
};

export const belisLockAdapter = (jwt: string): LockAdapter => ({
  listForObject: async ({ type, id }): Promise<Lock[]> =>
    locksOn(await loadLocks(jwt), await classId(type), new Set([id])),

  listForObjects: async (type, ids) =>
    locksOn(await loadLocks(jwt), await classId(type), new Set(ids)),

  listByUser: async (userString) =>
    (await loadLocks(jwt))
      .filter((row) => row.user_string === userString)
      .flatMap((row) => entitiesOf(row).map((entity) => toLock(row, entity))),

  write: ({ type, id }, userString, info) =>
    serialized(() => addEntity(jwt, type, id, userString, info)),

  remove: (lockId) => serialized(() => removeEntity(jwt, lockId)),
});
