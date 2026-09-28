import { useEffect, useRef, useState } from "react";

import {
  Control,
  type Positions,
} from "@carma-mapping/map-controls-layout";

import type { AddonComponentProps } from "../../lib/registry";
import { placeAtSlot, useStyleSlot } from "../../lib/style-slot";
import { useTrafficAnimationActions } from "./traffic-actions";
import {
  TRAFFIC_LAYER_ID,
  createTrafficEngine,
  type TrafficEngine,
} from "./traffic-engine";
import {
  parseTrafficNetwork,
  resolveNetworkUrl,
  type TrafficNetwork,
} from "./traffic-network";
import { TrafficPanel } from "./TrafficPanel";

/**
 * Cars, buses and trucks driving the roads of a network, by day and by night.
 *
 * A layer launches it: a style whose `metadata.carmaConf.tools` carries a
 * `trafficAnimation` with its `networkUrl` puts the traffic on the map for as
 * long as the layer is in the stack (`getLayerLaunchedAddons`), which also
 * hands over the layer's eye and opacity, and the layer's id: its style marks
 * with a `trafficAnimation` slot where in the layer order the vehicles are
 * drawn (`style-slot.ts`). The engine
 * (`traffic-engine.ts`) does the rest; this component fetches the network,
 * keeps one engine per map and network, and connects it to the channel.
 *
 * The moment shown is steered through the channel's `offsetMinutes`: the
 * panel writes it on a desktop route, the remote on the projection window.
 */

export type TrafficAnimationConfig = {
  /**
   * The road network, as `scripts/geodata/build-traffic-network.mjs` writes
   * it. Relative to the app's base unless absolute; see `resolveNetworkUrl`.
   */
  networkUrl?: string;
  /** what the panel calls it. Default: "Verkehr" */
  title?: string;
  /** factor on the vehicle bodies. Default 2.5 */
  sizeScale?: number;
  /** how dark the night veil gets, 0..1. Default 0.8 */
  nightDim?: number;
  /** most vehicles at once. Default 2500 */
  maxVehicles?: number;
  /** factor on the traffic density. Default 1 */
  densityScale?: number;
  /** the offset the traffic starts at, in minutes back from now. Default 0 */
  initialOffsetMinutes?: number;
  /** the launching layer's eye is shut */
  hidden?: boolean;
  /** the launching layer's opacity, 0..1 */
  opacity?: number;
  /**
   * The stack layer that launched the traffic. The vehicles are drawn under
   * the placeholder of its style's `trafficAnimation` slot, so they keep that
   * layer's place in the stack; without a slot they stay on top.
   */
  anchorLayerId?: string;
  /**
   * Whether the panel with the slider is shown. Default true; a host without
   * layer buttons (the projection window) has no one to use it.
   */
  showPanel?: boolean;
  /** Corner the panel is registered in. Default: "bottomleft" */
  controlPosition?: Positions;
  /** Sort order within that corner. Default: 20 */
  controlOrder?: number;
};

/** the slot a style marks the vehicles' place in the layer order with */
const TRAFFIC_SLOT = "trafficAnimation";

const DEFAULT_CONTROL_POSITION: Positions = "bottomleft";
const DEFAULT_CONTROL_ORDER = 20;

export const TrafficAnimation = ({
  config = {},
  libreMap,
}: AddonComponentProps<"trafficAnimation">) => {
  const {
    networkUrl,
    title = "Verkehr",
    sizeScale,
    nightDim,
    maxVehicles,
    densityScale,
    initialOffsetMinutes,
    hidden = false,
    opacity = 1,
    anchorLayerId,
    showPanel = true,
    controlPosition = DEFAULT_CONTROL_POSITION,
    controlOrder = DEFAULT_CONTROL_ORDER,
  } = config;

  const traffic = useTrafficAnimationActions();
  const { update, setOffsetMinutes, jump, offsetMinutes } = traffic;

  const [network, setNetwork] = useState<TrafficNetwork | null>(null);
  const engineRef = useRef<TrafficEngine | null>(null);

  // read at the engine's birth without rebuilding it when they move
  const offsetRef = useRef(offsetMinutes);
  offsetRef.current = offsetMinutes;
  const hiddenRef = useRef(hidden);
  hiddenRef.current = hidden;
  const opacityRef = useRef(opacity);
  opacityRef.current = opacity;

  const resolvedUrl = networkUrl ? resolveNetworkUrl(networkUrl) : "";

  // the channel says what runs, and forgets it when the engine goes
  useEffect(() => {
    if (!resolvedUrl) return undefined;
    update({ isOn: true, title, networkUrl: resolvedUrl });
    return () =>
      update({
        isOn: false,
        networkUrl: "",
        vehicleCount: 0,
        targetCount: 0,
        displayedAt: 0,
      });
  }, [resolvedUrl, title, update]);

  // a launch that names its moment starts there; a later relaunch of the same
  // network leaves the slider where the presenter put it
  useEffect(() => {
    if (initialOffsetMinutes !== undefined) {
      setOffsetMinutes(initialOffsetMinutes);
    }
  }, [initialOffsetMinutes, setOffsetMinutes]);

  useEffect(() => {
    update({ isHidden: hidden });
  }, [hidden, update]);

  useEffect(() => {
    if (!resolvedUrl) {
      setNetwork(null);
      return undefined;
    }
    const controller = new AbortController();
    let disposed = false;
    update({ isLoading: true, error: null });

    fetch(resolvedUrl, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText}`);
        }
        return response.json();
      })
      .then((json: unknown) => {
        if (disposed) return;
        const parsed = parseTrafficNetwork(json);
        if (!parsed) throw new Error("keine Straßen im Netz");
        setNetwork(parsed);
        update({ isLoading: false });
      })
      .catch((error: unknown) => {
        if (disposed || controller.signal.aborted) return;
        console.error("[TRAFFIC] network request failed", error);
        setNetwork(null);
        update({
          isLoading: false,
          error: error instanceof Error ? error.message : "unbekannter Fehler",
        });
      });

    return () => {
      disposed = true;
      controller.abort();
    };
  }, [resolvedUrl, update]);

  useEffect(() => {
    if (!libreMap || !network) return undefined;
    const engine = createTrafficEngine({
      map: libreMap,
      network,
      sizeScale,
      nightDim,
      maxVehicles,
      densityScale,
      offsetMinutes: offsetRef.current,
      onStats: (stats) =>
        update({
          vehicleCount: stats.vehicleCount,
          targetCount: stats.targetCount,
          isCapped: stats.capped,
          displayedAt: stats.displayedAt,
          darkness: Math.round(stats.darkness * 100) / 100,
          isNight: stats.darkness >= 0.5,
        }),
    });
    engine.setVisible(!hiddenRef.current);
    engine.setOpacity(opacityRef.current);
    engineRef.current = engine;
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, [libreMap, network, sizeScale, nightDim, maxVehicles, densityScale, update]);

  // The engine puts its layer back on the map after a style swap, on top;
  // the swap and every reorder fire `styledata`, which moves it back under
  // the placeholder.
  const placeholderId = useStyleSlot(
    libreMap,
    TRAFFIC_SLOT,
    anchorLayerId
  )?.placeholderId;
  useEffect(() => {
    if (!libreMap || !network || !placeholderId) return undefined;
    const place = () =>
      placeAtSlot(libreMap, [TRAFFIC_LAYER_ID], placeholderId);
    place();
    libreMap.on("styledata", place);
    return () => {
      libreMap.off("styledata", place);
    };
  }, [libreMap, network, placeholderId]);

  useEffect(() => {
    engineRef.current?.setOffsetMinutes(offsetMinutes);
  }, [offsetMinutes]);

  useEffect(() => {
    engineRef.current?.setVisible(!hidden);
  }, [hidden]);

  useEffect(() => {
    engineRef.current?.setOpacity(opacity);
  }, [opacity]);

  if (!libreMap || !resolvedUrl || !showPanel || hidden) {
    return null;
  }

  return (
    <Control position={controlPosition} order={controlOrder}>
      <TrafficPanel
        title={traffic.title}
        offsetMinutes={traffic.offsetMinutes}
        displayedAt={traffic.displayedAt}
        darkness={traffic.darkness}
        vehicleCount={traffic.vehicleCount}
        isCapped={traffic.isCapped}
        isLoading={traffic.isLoading}
        error={traffic.error}
        onOffset={setOffsetMinutes}
        onJump={jump}
      />
    </Control>
  );
};
