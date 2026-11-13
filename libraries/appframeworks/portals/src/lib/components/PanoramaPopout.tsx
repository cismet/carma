import { useEffect, useMemo, useRef, useState } from "react";

import { PanoramaViewer, type PanoramaHotspot } from "./PanoramaViewer";
import { PanoramaStationSwitcher } from "./PanoramaStationSwitcher";
import {
  panoramaPopoutChannelName,
  type PanoramaPopoutHostMessage,
  type PanoramaPopoutScene,
  type PanoramaPopoutViewerMessage,
} from "./panoramaPopoutChannel";
import "./PanoramaPopout.css";

// How long to wait for the host's answer to "hello" before telling the user
// that no host is listening (e.g. the tab was opened from a bookmark).
const HOST_TIMEOUT_MS = 2000;

const DEFAULT_TITLE = "Panorama";

interface PanoramaPopoutProps {
  /** Channel id the host passed in the popout url. */
  channel: string;
}

type HostStatus = "waiting" | "connected" | "gone";

/**
 * The panorama viewer as a page of its own, opened by the host app in a new
 * tab. It shows only the viewer (no close button: the user closes the tab) and
 * mirrors the host's selection: the host sends the scene, the popout sends back
 * the user's hops and view, which the host turns into a new selection.
 */
export const PanoramaPopout = ({ channel }: PanoramaPopoutProps) => {
  const [scene, setScene] = useState<PanoramaPopoutScene | null>(null);
  const [status, setStatus] = useState<HostStatus>("waiting");
  const channelRef = useRef<BroadcastChannel | null>(null);

  const post = (message: PanoramaPopoutViewerMessage) => {
    channelRef.current?.postMessage(message);
  };

  useEffect(() => {
    const bc = new BroadcastChannel(panoramaPopoutChannelName(channel));
    channelRef.current = bc;
    bc.onmessage = (e: MessageEvent<PanoramaPopoutHostMessage>) => {
      const message = e.data;
      if (message.type === "scene") {
        setStatus("connected");
        setScene(message.scene);
      } else if (message.type === "empty") {
        setStatus("connected");
        setScene(null);
      } else if (message.type === "bye") {
        setStatus("gone");
      }
    };
    bc.postMessage({ type: "hello" } satisfies PanoramaPopoutViewerMessage);
    const timeout = window.setTimeout(
      () => setStatus((s) => (s === "waiting" ? "gone" : s)),
      HOST_TIMEOUT_MS
    );
    const onPageHide = () =>
      bc.postMessage({ type: "bye" } satisfies PanoramaPopoutViewerMessage);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("pagehide", onPageHide);
      onPageHide();
      bc.close();
      channelRef.current = null;
    };
  }, [channel]);

  useEffect(() => {
    document.title = scene?.title
      ? `${scene.title} | ${DEFAULT_TITLE}`
      : DEFAULT_TITLE;
  }, [scene?.title]);

  // The host keeps the hotspots' handlers; a click is reported by id.
  const hotspots = useMemo<PanoramaHotspot[]>(
    () =>
      (scene?.hotspots ?? []).map((hotspot) => ({
        ...hotspot,
        clickHandlerFunc: hotspot.id
          ? () => post({ type: "hotspot", id: hotspot.id as string })
          : undefined,
      })),
    [scene?.hotspots]
  );

  return (
    <div className="carma-panorama-popout">
      {scene ? (
        <PanoramaViewer
          src={scene.src}
          multiResConfigUrl={scene.multiResConfigUrl}
          hotspots={hotspots}
          initialYaw={scene.initialYaw}
          startView={scene.startView}
          keepViewOnHop={scene.keepViewOnHop}
          heading={scene.heading}
          showLoading={scene.showLoading}
          onViewChange={(view) => post({ type: "view", view })}
          onNext={() => post({ type: "next" })}
          onPrevious={() => post({ type: "previous" })}
        />
      ) : (
        status !== "gone" && (
          <div className="carma-panorama-popout__message">
            {status === "waiting"
              ? "Verbindung zum Geoportal wird hergestellt …"
              : "Wählen Sie einen Panorama-Pfeil auf der Karte."}
          </div>
        )
      )}
      {status === "gone" && (
        <div className="carma-panorama-popout__message carma-panorama-popout__message--banner">
          Keine Verbindung zum Geoportal.
        </div>
      )}
      {scene?.stations && status !== "gone" && (
        <div className="carma-panorama-popout__toolbar">
          <PanoramaStationSwitcher
            {...scene.stations}
            onSelect={(index) => post({ type: "station", index })}
          />
        </div>
      )}
    </div>
  );
};

export default PanoramaPopout;
