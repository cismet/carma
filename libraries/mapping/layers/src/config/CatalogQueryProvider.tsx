import { useState, type ReactNode } from "react";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import localforage from "localforage";

export const CAPABILITIES_QUERY_KEY = "wmsCapabilities";

// how long persisted capabilities stay usable across reloads
export const CAPABILITIES_MAX_AGE = 1000 * 60 * 60 * 24 * 30;

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
        dehydrateOptions: {
          shouldDehydrateQuery: (query) =>
            query.state.status === "success" &&
            query.state.data != null &&
            query.queryKey[0] === CAPABILITIES_QUERY_KEY,
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
};
