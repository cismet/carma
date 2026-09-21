/**
 * Remote side of the map-relay protocol (`services/map-relay`): writes the
 * whole desired state of a session. The display side is
 * `@carma-mapping/addons` `outlet/relay.ts`.
 *
 * Every request stays CORS-simple: the body goes out as `text/plain`, which
 * the relay parses as JSON regardless, so the browser never sends a preflight.
 */

export type RelayTarget = {
  /** e.g. https://relay-wupp-digitaltwin.cismet.de, no trailing path */
  baseUrl: string;
  /** session code; case-insensitive, the relay upper-cases it */
  code: string;
};

export type RelayWriteResult = { v: number; ts: number };

export type RelayReadResult = { v: number; state: unknown };

export class RelayError extends Error {
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "RelayError";
    this.status = status;
  }
}

const sessionUrl = ({ baseUrl, code }: RelayTarget): string =>
  `${baseUrl.replace(/\/+$/, "")}/s/${encodeURIComponent(code.trim())}`;

const describeStatus = (status: number): string => {
  if (status === 404) {
    return "the relay does not know this session code";
  }
  if (status === 429) {
    return "the relay blocks this device for a minute after too many unknown codes";
  }
  if (status === 413) {
    return "the state is too large for the relay";
  }
  return `the relay answered HTTP ${status}`;
};

const request = async (url: string, init: RequestInit): Promise<unknown> => {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      cache: "no-store",
      credentials: "omit",
    });
  } catch (error) {
    throw new RelayError(
      `the relay is not reachable (${
        error instanceof Error ? error.message : String(error)
      })`
    );
  }
  if (!response.ok) {
    throw new RelayError(describeStatus(response.status), response.status);
  }
  return response.json() as Promise<unknown>;
};

/** Replace the session's state; displays apply it on their next poll. */
export const writeRelayState = async (
  target: RelayTarget,
  state: unknown
): Promise<RelayWriteResult> =>
  (await request(sessionUrl(target), {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ state }),
  })) as RelayWriteResult;

/** The session's current state, without waiting for a change. */
export const readRelayState = async (
  target: RelayTarget
): Promise<RelayReadResult> =>
  (await request(`${sessionUrl(target)}?since=-1`, {
    method: "GET",
  })) as RelayReadResult;

/** Tell the relay a remote is active, which puts polling displays on the fast rate. */
export const helloRelay = async (target: RelayTarget): Promise<void> => {
  await request(`${sessionUrl(target)}/hello`, { method: "POST" });
};
