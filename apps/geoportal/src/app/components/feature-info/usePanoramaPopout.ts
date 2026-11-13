import { useCallback, useEffect, useRef, useState } from "react";

import {
  panoramaPopoutChannelName,
  panoramaPopoutUrl,
  panoramaPopoutWindowName,
  type PanoramaHotspot,
  type PanoramaPopoutHostMessage,
  type PanoramaPopoutScene,
  type PanoramaPopoutViewerMessage,
  type PanoramaView,
} from "@carma-appframeworks/portals";

// Kept per tab, so a reloaded geoportal tab reconnects to its popout.
const CHANNEL_ID_KEY = "carma-panorama-popout-channel";

const getChannelId = () => {
  try {
    const stored = sessionStorage.getItem(CHANNEL_ID_KEY);
    if (stored) {
      return stored;
    }
  } catch {
    // no sessionStorage: a fresh id per page load
  }
  const id = crypto.randomUUID();
  try {
    sessionStorage.setItem(CHANNEL_ID_KEY, id);
  } catch {
    // see above
  }
  return id;
};

// The scene the popout shows; hotspots keep their handlers here, the popout
// reports a click by hotspot id.
export type PanoramaPopoutSource = Omit<
  PanoramaPopoutScene,
  "hotspots" | "startView"
> & { hotspots: PanoramaHotspot[] };

type PanoramaPopoutHandlers = {
  onView: (view: PanoramaView) => void;
  onNext: () => void;
  onPrevious: () => void;
  onStation: (index: number) => void;
};

/**
 * Host side of the panorama viewer opened in a tab of its own: sends it the
 * selected pano and turns the user's hops and view in that tab into the same
 * calls the in-page viewer makes. `viewRef` holds the latest view, where a
 * newly opened popout starts.
 */
export const usePanoramaPopout = (
  source: PanoramaPopoutSource | null,
  viewRef: { current: PanoramaView | null },
  handlers: PanoramaPopoutHandlers
) => {
  const [channelId] = useState(getChannelId);
  // a popout is open and listening
  const [connected, setConnected] = useState(false);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const postCurrent = useCallback(() => {
    const current = sourceRef.current;
    const message: PanoramaPopoutHostMessage = current
      ? {
          type: "scene",
          scene: {
            ...current,
            // functions cannot cross the channel
            hotspots: current.hotspots.map(
              ({ clickHandlerFunc, ...hotspot }) => hotspot
            ),
            startView: viewRef.current ?? undefined,
          },
        }
      : { type: "empty" };
    channelRef.current?.postMessage(message);
  }, [viewRef]);

  useEffect(() => {
    const bc = new BroadcastChannel(panoramaPopoutChannelName(channelId));
    channelRef.current = bc;
    bc.onmessage = (e: MessageEvent<PanoramaPopoutViewerMessage>) => {
      const message = e.data;
      if (message.type === "bye") {
        setConnected(false);
        return;
      }
      // any message means a popout is there, also one that outlived a reload
      // of this tab and so never said hello to it
      setConnected(true);
      const on = handlersRef.current;
      switch (message.type) {
        case "hello":
          postCurrent();
          break;
        case "view":
          on.onView(message.view);
          break;
        case "hotspot":
          sourceRef.current?.hotspots
            .find((hotspot) => hotspot.id === message.id)
            ?.clickHandlerFunc?.();
          break;
        case "next":
          on.onNext();
          break;
        case "previous":
          on.onPrevious();
          break;
        case "station":
          on.onStation(message.index);
          break;
      }
    };
    const onPageHide = () =>
      bc.postMessage({ type: "bye" } satisfies PanoramaPopoutHostMessage);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      onPageHide();
      bc.close();
      channelRef.current = null;
    };
  }, [channelId, postCurrent]);

  // Follow the selection. Posted also while no popout is known, so one that
  // survived a reload of this tab picks the scene up again.
  useEffect(() => {
    postCurrent();
  }, [source, postCurrent]);

  const open = useCallback(() => {
    window.open(
      panoramaPopoutUrl(channelId),
      panoramaPopoutWindowName(channelId)
    );
  }, [channelId]);

  return { connected, open };
};
