import type { Lock, LockAdapter, ObjectLock } from "./types";

// cs_class isn't in GraphQL, so the app resolves class ids (e.g. via REST)
export interface CidsLockTransport {
  query: <T>(query: string, variables: Record<string, unknown>) => Promise<T>;
  classId: (table: string) => Promise<number>;
  save: (table: string, data: Record<string, unknown>) => Promise<number>;
  remove: (
    table: string,
    id: number,
    options?: { keepalive?: boolean }
  ) => Promise<void>;
}

export interface ListedLock extends ObjectLock {
  classId: number;
}

export interface CidsLockAdapter extends LockAdapter {
  listAll(): Promise<ListedLock[]>;
}

interface LockRow {
  id: number;
  class_id?: number | string;
  object_id?: number | string;
  user_string: string;
  additional_info: string | null;
}

interface LockRows {
  cs_locks?: LockRow[];
}

const LOCK_TABLE = "cs_locks";

const lockForObjectQuery = `query LockForObject($classId: Int!, $objectId: Int!) {
  cs_locks(where: {class_id: {_eq: $classId}, object_id: {_eq: $objectId}}, order_by: {id: asc}) {
    id
    user_string
    additional_info
  }
}`;

const locksForObjectsQuery = `query LocksForObjects($classId: Int!, $objectIds: [Int!]!) {
  cs_locks(where: {class_id: {_eq: $classId}, object_id: {_in: $objectIds}}, order_by: {id: asc}) {
    id
    object_id
    user_string
    additional_info
  }
}`;

const locksByUserQuery = `query LocksByUser($userString: String!) {
  cs_locks(where: {user_string: {_eq: $userString}}) {
    id
    user_string
    additional_info
  }
}`;

const allLocksQuery = `query AllLocks {
  cs_locks(order_by: {id: asc}) {
    id
    class_id
    object_id
    user_string
    additional_info
  }
}`;

const toLock = (row: LockRow): Lock => ({
  id: row.id,
  userString: row.user_string,
  info: row.additional_info,
});

// LockAdapter on the cids cs_locks table; LockTarget.type is the table name
export const createCidsLockAdapter = (
  transport: CidsLockTransport
): CidsLockAdapter => {
  const rows = async (query: string, variables: Record<string, unknown>) =>
    (await transport.query<LockRows>(query, variables)).cs_locks ?? [];

  return {
    listForObject: async ({ type, id }) => {
      const classId = await transport.classId(type);
      return (await rows(lockForObjectQuery, { classId, objectId: id })).map(
        toLock
      );
    },

    listForObjects: async (type, ids) => {
      const classId = await transport.classId(type);
      return (
        await rows(locksForObjectsQuery, { classId, objectIds: ids })
      ).map((row) => ({ ...toLock(row), objectId: Number(row.object_id) }));
    },

    listByUser: async (userString) =>
      (await rows(locksByUserQuery, { userString })).map(toLock),

    listAll: async () =>
      (await rows(allLocksQuery, {})).map((row) => ({
        ...toLock(row),
        classId: Number(row.class_id),
        objectId: Number(row.object_id),
      })),

    write: async ({ type, id }, userString, info) =>
      transport.save(LOCK_TABLE, {
        class_id: await transport.classId(type),
        object_id: id,
        user_string: userString,
        additional_info: info,
      }),

    remove: (lockId, options) => transport.remove(LOCK_TABLE, lockId, options),
  };
};

interface CidsClassEntry {
  $self?: string;
  name?: string;
  configuration?: {
    NAME?: string;
    TABLE_NAME?: string;
    LEGACY_ID?: number | string;
  };
}

// "/BELIS2.TDTA_STANDORT_MAST" → "tdta_standort_mast"
const keysOf = (entry: CidsClassEntry) =>
  [
    entry.configuration?.NAME,
    entry.configuration?.TABLE_NAME,
    entry.name,
    entry.$self?.split(".").pop(),
  ]
    .filter((key): key is string => Boolean(key))
    .map((key) => key.toLowerCase());

// GET <rest>/classes?domain=<domain>&limit=1000&offset=0&role=all, loaded once.
// Matched by class name, table name or $self, ignoring case: the class name
// is not always the table name.
export const createCidsClassIdLookup = (
  endpoint: string,
  getJwt: () => string | undefined
) => {
  let cache: Promise<Map<string, number>> | undefined;

  const load = async () => {
    const response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${getJwt() ?? ""}` },
    });
    if (!response.ok) {
      throw new Error(
        `Die Klassenliste konnte nicht geladen werden (Status ${String(
          response.status
        )}).`
      );
    }
    const payload = (await response.json()) as {
      $collection?: CidsClassEntry[];
    };
    const ids = new Map<string, number>();
    for (const entry of payload.$collection ?? []) {
      const id = Number(entry.configuration?.LEGACY_ID);
      if (Number.isInteger(id)) {
        for (const key of keysOf(entry)) {
          ids.set(key, id);
        }
      }
    }
    if (!ids.size) {
      console.warn("Klassenliste ohne verwendbare Einträge", payload);
    }
    return ids;
  };

  return async (table: string) => {
    cache ??= load().catch((error: unknown) => {
      cache = undefined;
      throw error;
    });
    const id = (await cache).get(table.toLowerCase());
    if (id === undefined) {
      throw new Error(
        `Die Klasse ${table} konnte auf dem Server nicht gefunden werden.`
      );
    }
    return id;
  };
};
