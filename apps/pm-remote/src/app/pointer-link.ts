import {
  POINTER_LINK_CHANNEL,
  POINTER_LINK_LABEL,
  POINTER_LINK_RTC,
  RelayError,
  gatheredDescription,
  helloRelay,
  isPointerLinkDescription,
  isPointerLinkPong,
  parseLinkMessage,
  readRelayState,
  writeRelayState,
  type PointerLinkPing,
  type PointerSample,
  type RelayTarget,
} from "@carma-mapping/show-remote";

const LOG_PREFIX = "[PM POINTER LINK]";

/** how often the phone looks for the display's answer, and for how long */
const ANSWER_POLL_MS = 250;
const ANSWER_WAIT_MS = 8000;
/** from the answer to an open channel; on the local network well under a second */
const OPEN_WAIT_MS = 8000;
const PING_MS = 1000;
/** an open channel that has not answered a ping for this long is taken as gone */
const PONG_TIMEOUT_MS = 4000;
const RETRY_BASE_MS = 2000;
const RETRY_CEILING_MS = 30_000;
/**
 * Samples piling up in the channel's buffer mean the network is not taking
 * them; sending more only makes the ones behind them older.
 */
const MAX_BUFFERED_BYTES = 16 * 1024;

/**
 * off: closed. connecting: handshake running. open: samples go direct.
 * unreachable: the last attempt failed, the next one is scheduled.
 */
export type PointerLinkState = "off" | "connecting" | "open" | "unreachable";

export type PointerLink = {
  /** sends when the channel is open, and says whether it did */
  send: (sample: PointerSample) => boolean;
  state: () => PointerLinkState;
  /** round trip over the channel, null until the first ping came back */
  rttMs: () => number | null;
  /** an attempt at once instead of the scheduled one, e.g. back from the lock screen */
  wake: () => void;
  close: () => void;
};

const newLinkId = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => window.setTimeout(resolve, ms));

/**
 * The phone's side of the pointer's direct link (`@carma-mapping/show-remote`
 * `pointer-link.ts`): offers a data channel through the relay, waits for the
 * display's answer, and keeps trying with growing pauses while there is no
 * way through. The pointer's relay path does not depend on any of it.
 */
export const openPointerLink = ({
  offer,
  answer,
}: {
  offer: RelayTarget;
  answer: RelayTarget;
}): PointerLink => {
  let state: PointerLinkState = "connecting";
  let peer: RTCPeerConnection | null = null;
  let channel: RTCDataChannel | null = null;
  /** counts attempts; callbacks of an earlier one compare and drop out */
  let attempt = 0;
  let retryTimer: number | null = null;
  let pingTimer: number | null = null;
  let backoff = RETRY_BASE_MS;
  let lastPongAt = 0;
  let rtt: number | null = null;
  let isClosed = false;

  const teardown = () => {
    if (pingTimer !== null) {
      window.clearInterval(pingTimer);
      pingTimer = null;
    }
    channel = null;
    peer?.close();
    peer = null;
    rtt = null;
  };

  const fail = (id: number, reason: string) => {
    if (isClosed || id !== attempt) {
      return;
    }
    console.info(`${LOG_PREFIX} no direct link: ${reason}`);
    // later events of this attempt are of no interest any more
    attempt += 1;
    teardown();
    state = "unreachable";
    const delay = backoff;
    backoff = Math.min(backoff * 2, RETRY_CEILING_MS);
    retryTimer = window.setTimeout(() => {
      retryTimer = null;
      void connect();
    }, delay);
  };

  const onOpen = (id: number, open: RTCDataChannel) => {
    if (isClosed || id !== attempt) {
      return;
    }
    channel = open;
    state = "open";
    backoff = RETRY_BASE_MS;
    lastPongAt = performance.now();
    pingTimer = window.setInterval(() => {
      if (performance.now() - lastPongAt > PONG_TIMEOUT_MS) {
        fail(id, "the display stopped answering");
        return;
      }
      if (open.readyState === "open") {
        const ping: PointerLinkPing = { ping: performance.now() };
        open.send(JSON.stringify(ping));
      }
    }, PING_MS);
    console.info(`${LOG_PREFIX} direct link open`);
  };

  /** the display's answer to this offer, or null once waiting is pointless */
  const waitForAnswer = async (
    id: number,
    linkId: string
  ): Promise<string | null> => {
    const until = performance.now() + ANSWER_WAIT_MS;
    while (performance.now() < until) {
      if (isClosed || id !== attempt) {
        return null;
      }
      try {
        const { state: current } = await readRelayState(answer);
        if (isPointerLinkDescription(current) && current.id === linkId) {
          return current.sdp;
        }
      } catch (error) {
        // an unknown session counts as guessing at the relay; asking again
        // would get the phone throttled, and with it the whole remote
        if (
          error instanceof RelayError &&
          (error.status === 404 || error.status === 429)
        ) {
          throw error;
        }
        console.warn(`${LOG_PREFIX} reading the answer failed`, error);
      }
      await sleep(ANSWER_POLL_MS);
    }
    return null;
  };

  const connect = async () => {
    if (isClosed) {
      return;
    }
    attempt += 1;
    const id = attempt;
    teardown();
    state = "connecting";
    const current = new RTCPeerConnection(POINTER_LINK_RTC);
    peer = current;
    const dataChannel = current.createDataChannel(
      POINTER_LINK_LABEL,
      POINTER_LINK_CHANNEL
    );
    dataChannel.addEventListener("open", () => onOpen(id, dataChannel));
    dataChannel.addEventListener("close", () => fail(id, "channel closed"));
    dataChannel.addEventListener("message", (event: MessageEvent) => {
      const message = parseLinkMessage(event.data);
      if (isPointerLinkPong(message)) {
        lastPongAt = performance.now();
        rtt = Math.round(lastPongAt - message.pong);
      }
    });
    current.addEventListener("connectionstatechange", () => {
      if (current.connectionState === "failed") {
        fail(id, "connection failed");
      }
    });
    try {
      const linkId = newLinkId();
      await current.setLocalDescription(await current.createOffer());
      const sdp = await gatheredDescription(current);
      if (isClosed || id !== attempt) {
        return;
      }
      // the answer session has to exist before it is read, see waitForAnswer
      await helloRelay(answer);
      await writeRelayState(offer, { id: linkId, sdp });
      const answerSdp = await waitForAnswer(id, linkId);
      if (isClosed || id !== attempt) {
        return;
      }
      if (answerSdp === null) {
        fail(id, "the display did not answer");
        return;
      }
      await current.setRemoteDescription({ type: "answer", sdp: answerSdp });
      await sleep(OPEN_WAIT_MS);
      if (id === attempt && state === "connecting") {
        fail(id, "the channel did not open");
      }
    } catch (error) {
      fail(id, error instanceof Error ? error.message : String(error));
    }
  };

  void connect();

  return {
    send: (sample) => {
      if (
        state !== "open" ||
        !channel ||
        channel.readyState !== "open" ||
        channel.bufferedAmount > MAX_BUFFERED_BYTES
      ) {
        return false;
      }
      try {
        channel.send(JSON.stringify(sample));
        return true;
      } catch (error) {
        console.warn(`${LOG_PREFIX} sending failed`, error);
        return false;
      }
    },
    state: () => state,
    rttMs: () => rtt,
    wake: () => {
      if (isClosed || state !== "unreachable") {
        return;
      }
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
        retryTimer = null;
      }
      backoff = RETRY_BASE_MS;
      void connect();
    },
    close: () => {
      isClosed = true;
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
        retryTimer = null;
      }
      teardown();
      state = "off";
    },
  };
};
