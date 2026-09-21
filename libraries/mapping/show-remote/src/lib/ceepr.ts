import { isShow, type Show } from "./show";

/**
 * Shows are kept in ceepr, the store the geoportal's share links use, in a
 * folder of their own. ceepr can only store and read: every publish gets a new
 * random key and a stored show never changes, so a device may keep what it
 * read under a key for good.
 */
export const DEFAULT_SHOW_STORE_URL =
  "https://ceepr.cismet.de/store/wuppertal/_dev_geoportal_pmshows";
export const DEFAULT_SHOW_READ_URL =
  "https://ceepr.cismet.de/config/wuppertal/_dev_geoportal_pmshows/";

/** ceepr parses bodies with express.json(), whose default limit is 100 kB */
export const MAX_SHOW_BYTES = 100 * 1024;

export const showByteSize = (show: Show): number =>
  new TextEncoder().encode(JSON.stringify(show)).length;

export class ShowStoreError extends Error {
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "ShowStoreError";
    this.status = status;
  }
}

/** Store a show and resolve to the key it can be read back under. */
export const publishShow = async (
  storeUrl: string,
  show: Show
): Promise<string> => {
  const response = await fetch(storeUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(show),
  });
  if (!response.ok) {
    throw new ShowStoreError(
      response.status === 413
        ? "the show is too large for the store"
        : `the store answered HTTP ${response.status}`,
      response.status
    );
  }
  const data: unknown = await response.json();
  const key =
    typeof data === "object" && data !== null && "key" in data
      ? data.key
      : undefined;
  if (typeof key !== "string") {
    throw new ShowStoreError("the store answered without a key");
  }
  return key;
};

export const showReadUrl = (readUrl: string, key: string): string =>
  `${readUrl.replace(/\/+$/, "")}/${encodeURIComponent(key)}`;

/** Read a published show; rejects when the key names nothing or not a show. */
export const fetchShow = async (readUrl: string, key: string): Promise<Show> => {
  const response = await fetch(showReadUrl(readUrl, key));
  if (!response.ok) {
    throw new ShowStoreError(
      response.status === 404
        ? `no show is stored under ${key}`
        : `the store answered HTTP ${response.status}`,
      response.status
    );
  }
  const data: unknown = await response.json();
  if (!isShow(data)) {
    throw new ShowStoreError(`what is stored under ${key} is not a show`);
  }
  return data;
};
