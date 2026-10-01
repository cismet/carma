import {
  isDerivedCacheRecordValid,
  refreshDerivedCacheMetadata,
  type DerivedCacheMetadata,
} from "./derived-cache-policy";
import {
  matchesDerivedCacheTreeRead,
  type DerivedCacheReadOptions,
} from "./derived-cache-tree-policy";

type ReadTransaction = <T>(
  fallback: T,
  use: (tx: IDBTransaction, age: number, done: (value: T) => void) => void,
  readOnly?: boolean
) => Promise<T>;
type ReadRequest = <T>(
  tx: IDBTransaction,
  request: IDBRequest<T>,
  use: (value: T) => void
) => void;

/** Reads validate hierarchy before deserializing large buffers. Actual display
 * use can be recorded separately, without restoring payloads or heating parents.
 */
export const createDerivedCacheReader = (dependencies: {
  transaction: ReadTransaction;
  read: ReadRequest;
  allMetadata: (
    tx: IDBTransaction,
    use: (rows: DerivedCacheMetadata[]) => void,
    namespace?: string
  ) => void;
  physicalNamespace: (namespace: string) => string | null;
  publicMetadata: (record: DerivedCacheMetadata) => DerivedCacheMetadata;
}) => {
  const { transaction, read, allMetadata, physicalNamespace, publicMetadata } =
    dependencies;
  return {
    get<T>(
      namespace: string,
      key: string,
      version: string,
      options?: DerivedCacheReadOptions
    ) {
      const physical = physicalNamespace(namespace);
      if (physical === null) return Promise.resolve(null);
      return transaction<{ value: T; metadata: DerivedCacheMetadata } | null>(
        null,
        (tx, age, done) =>
          read(
            tx,
            tx.objectStore("metadata").get([physical, key]),
            (record: DerivedCacheMetadata | undefined) => {
              if (
                !record ||
                record.version !== version ||
                !isDerivedCacheRecordValid(record)
              )
                return;
              const restore = () =>
                read(
                  tx,
                  tx.objectStore("payload").get([physical, key]),
                  (value: T | undefined) => {
                    if (value === undefined) return;
                    const metadata =
                      options?.touch === false
                        ? record
                        : {
                            ...refreshDerivedCacheMetadata(
                              record,
                              age,
                              Date.now()
                            ),
                            hits: (record.hits ?? 0) + 1,
                          };
                    if (options?.touch !== false)
                      tx.objectStore("metadata").put(metadata);
                    done({ value, metadata: publicMetadata(metadata) });
                  }
                );
              if (record.tree || options?.tree)
                allMetadata(
                  tx,
                  (rows) => {
                    if (
                      matchesDerivedCacheTreeRead(rows, record, options?.tree)
                    )
                      restore();
                  },
                  physical
                );
              else restore();
            }
          ),
        options?.touch === false
      );
    },
    markTreeUsed(
      namespace: string,
      version: string,
      identity: string,
      nodes: readonly string[]
    ) {
      const physical = physicalNamespace(namespace);
      if (physical === null || !identity) return Promise.resolve(0);
      const requested = new Set(nodes);
      return transaction(0, (tx, age, done) =>
        allMetadata(
          tx,
          (rows) => {
            const now = Date.now();
            let count = 0;
            for (const record of rows) {
              if (
                record.namespace !== physical ||
                record.version !== version ||
                !record.tree ||
                !requested.has(record.tree.node) ||
                !isDerivedCacheRecordValid(record) ||
                !matchesDerivedCacheTreeRead(rows, record, {
                  identity,
                  node: record.tree.node,
                })
              )
                continue;
              tx.objectStore("metadata").put({
                ...refreshDerivedCacheMetadata(record, age, now),
                hits: (record.hits ?? 0) + 1,
              });
              count += 1;
            }
            done(count);
          },
          physical
        )
      );
    },
  };
};
