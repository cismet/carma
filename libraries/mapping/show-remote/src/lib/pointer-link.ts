/**
 * The pointer's direct link: when phone and display share a network, the
 * samples also go straight from one to the other over a WebRTC data channel,
 * without the round trips to the relay.
 *
 * The relay only carries the handshake. The phone leaves its offer in one
 * session, the display answers in another; each side waits until its
 * connection candidates are gathered and writes them in one go, so a single
 * state document per direction is enough. The relay path to the pointer
 * session keeps running next to the link, and the display draws the sample
 * with the highest `seq`, whichever way it came: nothing has to switch over
 * when the link comes up or goes away.
 *
 * No STUN or TURN server: the link is for the local network only, where the
 * browsers find each other by their `.local` names.
 */

/** the two relay sessions of the handshake, named in the `PointerChannel` */
export type PointerLinkSessions = {
  /** the phone writes its offer here */
  offer: string;
  /** the display writes its answer here */
  answer: string;
};

/**
 * An offer or an answer. The answer repeats the offer's `id`, so the phone
 * never takes an answer to an earlier attempt for the current one.
 */
export type PointerLinkDescription = {
  id: string;
  sdp: string;
};

/** the phone asks, the display sends the number back, the phone gets the round trip */
export type PointerLinkPing = { ping: number };
export type PointerLinkPong = { pong: number };

export const POINTER_LINK_LABEL = "pointer";

/** only the newest sample counts: no waiting for order, no resends */
export const POINTER_LINK_CHANNEL: RTCDataChannelInit = {
  ordered: false,
  maxRetransmits: 0,
};

export const POINTER_LINK_RTC: RTCConfiguration = { iceServers: [] };

/** on the local network the candidates are there at once; this is a backstop */
const GATHER_TIMEOUT_MS = 2000;

/** next to the pointer session (`pointerSessionCode`): `<CODE>-PO` and `<CODE>-PA` */
export const pointerLinkSessions = (
  pointerSession: string
): PointerLinkSessions => ({
  offer: `${pointerSession}O`,
  answer: `${pointerSession}A`,
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export const isPointerLinkSessions = (
  value: unknown
): value is PointerLinkSessions =>
  isRecord(value) &&
  typeof value["offer"] === "string" &&
  value["offer"] !== "" &&
  typeof value["answer"] === "string" &&
  value["answer"] !== "";

export const isPointerLinkDescription = (
  value: unknown
): value is PointerLinkDescription =>
  isRecord(value) &&
  typeof value["id"] === "string" &&
  value["id"] !== "" &&
  typeof value["sdp"] === "string" &&
  value["sdp"] !== "";

export const isPointerLinkPing = (value: unknown): value is PointerLinkPing =>
  isRecord(value) && isFiniteNumber(value["ping"]);

export const isPointerLinkPong = (value: unknown): value is PointerLinkPong =>
  isRecord(value) && isFiniteNumber(value["pong"]);

/** a data channel message, or undefined when it is not JSON */
export const parseLinkMessage = (data: unknown): unknown => {
  if (typeof data !== "string") {
    return undefined;
  }
  try {
    return JSON.parse(data) as unknown;
  } catch {
    return undefined;
  }
};

/**
 * The local description once every candidate is in it. Call after
 * `setLocalDescription`; after the timeout it returns what is there.
 */
export const gatheredDescription = async (
  peer: RTCPeerConnection,
  timeoutMs: number = GATHER_TIMEOUT_MS
): Promise<string> => {
  if (peer.iceGatheringState !== "complete") {
    await new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        peer.removeEventListener("icegatheringstatechange", onState);
        peer.removeEventListener("icecandidate", onCandidate);
        resolve();
      };
      const onState = () => {
        if (peer.iceGatheringState === "complete") {
          done();
        }
      };
      // the last candidate event carries none; some browsers skip the state event
      const onCandidate = (event: RTCPeerConnectionIceEvent) => {
        if (event.candidate === null) {
          done();
        }
      };
      const timer = setTimeout(done, timeoutMs);
      peer.addEventListener("icegatheringstatechange", onState);
      peer.addEventListener("icecandidate", onCandidate);
    });
  }
  const sdp = peer.localDescription?.sdp;
  if (!sdp) {
    throw new Error("no local description to send");
  }
  return sdp;
};
