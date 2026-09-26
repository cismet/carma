import {
  POINTER_LINK_RTC,
  gatheredDescription,
  isPointerLinkDescription,
  isPointerLinkPing,
  isPointerSample,
  parseLinkMessage,
  writeRelayState,
  type PointerLinkPong,
  type PointerLinkSessions,
  type PointerSample,
} from "@carma-mapping/show-remote";

import { subscribe } from "./relay";

const LOG_PREFIX = "[OUTLET POINTER LINK]";

/**
 * The display's side of the pointer's direct link (`@carma-mapping/show-remote`
 * `pointer-link.ts`): answers every new offer the phone leaves in the offer
 * session and hands the samples that come over the channel to `onSample`.
 * Each new offer replaces the connection of the one before, since the phone
 * only makes one when its last link is gone.
 *
 * Writing the answer is the one write the source window makes to the relay;
 * everything else it only reads (see `relay.ts`).
 */
export const answerPointerLink = ({
  base,
  sessions,
  onSample,
}: {
  base: string;
  sessions: PointerLinkSessions;
  onSample: (sample: PointerSample) => void;
}): { stop: () => void } => {
  let peer: RTCPeerConnection | null = null;
  let answeredId: string | null = null;
  let isStopped = false;

  const closePeer = () => {
    peer?.close();
    peer = null;
  };

  const answer = async (id: string, offerSdp: string) => {
    closePeer();
    const current = new RTCPeerConnection(POINTER_LINK_RTC);
    peer = current;
    current.addEventListener("datachannel", ({ channel }) => {
      channel.addEventListener("message", (event: MessageEvent) => {
        const message = parseLinkMessage(event.data);
        if (isPointerSample(message)) {
          onSample(message);
        } else if (
          isPointerLinkPing(message) &&
          channel.readyState === "open"
        ) {
          const pong: PointerLinkPong = { pong: message.ping };
          channel.send(JSON.stringify(pong));
        }
      });
    });
    current.addEventListener("connectionstatechange", () => {
      console.info(`${LOG_PREFIX} ${current.connectionState}`);
    });
    await current.setRemoteDescription({ type: "offer", sdp: offerSdp });
    await current.setLocalDescription(await current.createAnswer());
    const sdp = await gatheredDescription(current);
    if (isStopped || peer !== current) {
      return;
    }
    await writeRelayState(
      { baseUrl: base, code: sessions.answer },
      { id, sdp }
    );
  };

  const subscription = subscribe({
    base,
    code: sessions.offer,
    onState: (state) => {
      if (!isPointerLinkDescription(state) || state.id === answeredId) {
        return;
      }
      answeredId = state.id;
      answer(state.id, state.sdp).catch((error: unknown) => {
        // the phone waits in vain and offers again
        console.warn(`${LOG_PREFIX} answering failed`, error);
      });
    },
  });

  return {
    stop: () => {
      isStopped = true;
      subscription.stop();
      closePeer();
    },
  };
};
