import { isShow, type Show } from "./show";

/**
 * Shows are kept in ceepr, the store the geoportal's share links use, in a
 * folder of their own. A show is stored with an edit token, which lets a later
 * publish replace it under the same key: the phone link stays the same while
 * the show changes. So a show read under a key may be outdated, and a device
 * reads it again rather than keeping it for good.
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

const EDIT_TOKEN_HEADER = "X-Ceepr-Edit-Token";

/** a random edit token, in the alphabet ceepr accepts */
export const newEditToken = (): string => {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  );
};

const storeError = (status: number): ShowStoreError => {
  if (status === 413) {
    return new ShowStoreError("the show is too large for the store", status);
  }
  if (status === 403 || status === 404) {
    return new ShowStoreError(
      "the store does not let this browser change the show under this key",
      status
    );
  }
  return new ShowStoreError(`the store answered HTTP ${status}`, status);
};

/**
 * Store a show under a new key and resolve to that key. The edit token is
 * what a later `republishShow` needs to replace it.
 */
export const publishShow = async (
  storeUrl: string,
  show: Show,
  editToken: string
): Promise<string> => {
  const response = await fetch(storeUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [EDIT_TOKEN_HEADER]: editToken,
    },
    body: JSON.stringify(show),
  });
  if (!response.ok) {
    throw storeError(response.status);
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

const showStoreUrl = (storeUrl: string, key: string): string =>
  `${storeUrl.replace(/\/+$/, "")}/${encodeURIComponent(key)}`;

/**
 * Replace the show stored under `key`, so the link that names it shows the new
 * one. Rejects with status 403 or 404 when the key was stored without this
 * token (or by a store that cannot replace), which is a case for a new key.
 */
export const republishShow = async (
  storeUrl: string,
  key: string,
  show: Show,
  editToken: string
): Promise<void> => {
  const response = await fetch(showStoreUrl(storeUrl, key), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      [EDIT_TOKEN_HEADER]: editToken,
    },
    body: JSON.stringify(show),
  });
  if (!response.ok) {
    throw storeError(response.status);
  }
};

export const showReadUrl = (readUrl: string, key: string): string =>
  `${readUrl.replace(/\/+$/, "")}/${encodeURIComponent(key)}`;

/** Read a published show; rejects when the key names nothing or not a show. */
export const fetchShow = async (readUrl: string, key: string): Promise<Show> => {
  // a republish changes what the key names, so the browser has to ask again
  const response = await fetch(showReadUrl(readUrl, key), {
    cache: "no-cache",
  });
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
