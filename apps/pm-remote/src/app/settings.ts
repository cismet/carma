/**
 * What the remote keeps on the phone between visits. A link can bring any of
 * it along (`?show=<key>&relay=<code>&relayBase=<url>`); what the link names
 * wins and is kept from then on, so the link only has to be opened once.
 */
export const STORAGE_PREFIX = "@pm-remote.1";

const SETTINGS_KEY = `${STORAGE_PREFIX}.settings`;

/**
 * The local relay `npx nx run map-relay:serve` starts, when a build names
 * none. A phone reaching the dev server over the network cannot see the
 * desk's localhost, so there the dev server's `/local-relay` proxy stands in.
 */
const localRelayBaseUrl = (): string =>
  typeof window === "undefined" ||
  ["localhost", "127.0.0.1"].includes(window.location.hostname)
    ? "http://localhost:8099"
    : "/local-relay";

export const DEFAULT_RELAY_BASE_URL =
  import.meta.env.VITE_RELAY_BASE_URL || localRelayBaseUrl();

/** the fade choices offered, in milliseconds; 0 cuts */
export const FADE_CHOICES = [0, 1000, 2000, 4000] as const;
export const DEFAULT_FADE_MS = 2000;

export type RemoteSettings = {
  relayBaseUrl: string;
  /** the session code the display was started with (`#/outlet?relay=`) */
  code: string;
  /** the ceepr key the pm-show publish gave */
  showKey: string;
  fadeMs: number;
};

const LOG_PREFIX = "[PM REMOTE]";

const readStored = (): Record<string, unknown> => {
  try {
    const parsed: unknown = JSON.parse(
      window.localStorage.getItem(SETTINGS_KEY) ?? "{}"
    );
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  } catch (error) {
    console.warn(`${LOG_PREFIX} stored settings unreadable`, error);
    return {};
  }
};

const stringOr = (value: unknown, fallback: string): string =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : fallback;

/**
 * A show key as typed or pasted: the bare key, or the whole link the pm-show
 * publish shows, from which the `show` parameter is taken.
 */
export const normalizeShowKey = (input: string): string => {
  const trimmed = input.trim();
  if (!/^https?:\/\//.test(trimmed)) {
    return trimmed;
  }
  try {
    return new URL(trimmed).searchParams.get("show")?.trim() ?? trimmed;
  } catch {
    return trimmed;
  }
};

export const loadSettings = (
  search: string = window.location.search
): RemoteSettings => {
  const stored = readStored();
  const params = new URLSearchParams(search);
  const fadeMs = stored["fadeMs"];
  const settings: RemoteSettings = {
    relayBaseUrl: stringOr(
      params.get("relayBase"),
      stringOr(stored["relayBaseUrl"], DEFAULT_RELAY_BASE_URL)
    ),
    code: stringOr(params.get("relay"), stringOr(stored["code"], "")),
    showKey: normalizeShowKey(
      stringOr(params.get("show"), stringOr(stored["showKey"], ""))
    ),
    fadeMs:
      typeof fadeMs === "number" && Number.isFinite(fadeMs) && fadeMs >= 0
        ? fadeMs
        : DEFAULT_FADE_MS,
  };
  saveSettings(settings);
  return settings;
};

export const saveSettings = (settings: RemoteSettings): void => {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.warn(`${LOG_PREFIX} storing the settings failed`, error);
  }
};
