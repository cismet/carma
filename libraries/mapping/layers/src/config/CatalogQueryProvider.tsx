import { useState, type ReactNode } from "react";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import localforage from "localforage";

export const CAPABILITIES_QUERY_KEY = "wmsCapabilities";

export const ADDITIONAL_CONFIG_QUERY_KEY = "additionalConfig";
export const SENSOR_CONFIG_QUERY_KEY = "sensorConfig";
export const OBJECT_CONFIG_QUERY_KEY = "objectConfig";

const PERSISTED_QUERY_KEYS = [
  CAPABILITIES_QUERY_KEY,
  ADDITIONAL_CONFIG_QUERY_KEY,
  SENSOR_CONFIG_QUERY_KEY,
  OBJECT_CONFIG_QUERY_KEY,
];

// how long persisted capabilities stay usable across reloads
export const CAPABILITIES_MAX_AGE = 1000 * 60 * 60 * 24 * 30;

export const PERSISTED_QUERY_GC_TIME = Infinity;

const MAX_RETRIES = 2;

const queryStorage = localforage.createInstance({
  name: "carma-layer-catalog",
  storeName: "queryCache",
});

const persister = createAsyncStoragePersister({
  storage: {
    getItem: (key: string) => queryStorage.getItem<string>(key),
    setItem: (key: string, value: string) => queryStorage.setItem(key, value),
    removeItem: (key: string) => queryStorage.removeItem(key),
  },
});

export const CatalogQueryProvider = ({ children }: { children: ReactNode }) => {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // retrying a 401 only delays the login prompt
            retry: (failureCount, error) => {
              const status = (error as { status?: number } | null)?.status;
              if (status === 401) {
                return false;
              }
              return failureCount < MAX_RETRIES;
            },
            refetchOnWindowFocus: false,
            refetchOnReconnect: false,
          },
        },
      })
  );

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: CAPABILITIES_MAX_AGE,
        // blobs written before findLayerAndAddTags stopped mutating the cached
        // capabilities carry the injected `tags`, which keeps them unequal to
        // freshly fetched ones; bump to discard them once
        buster: "capabilities-untagged-v1",
        dehydrateOptions: {
          // Keyed on data presence, not on `success`: a failed background
          // refetch flips the status to `error` while keeping the previous
          // data, and dropping those entries would silently throw away a
          // perfectly usable cache on the next write.
          shouldDehydrateQuery: (query) =>
            query.state.data != null &&
            PERSISTED_QUERY_KEYS.includes(query.queryKey[0] as string),
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
};
