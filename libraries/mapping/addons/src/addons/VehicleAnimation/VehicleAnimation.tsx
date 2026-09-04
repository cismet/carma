import { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTrain } from "@fortawesome/free-solid-svg-icons";
import { Tooltip } from "antd";

import {
  Control,
  ControlButtonStyler,
  type Positions,
} from "@carma-mapping/map-controls-layout";

import type { AddonComponentProps } from "../../lib/registry";
import { buildTrack, type Track } from "./track";
import { createVehicleLayer, type VehicleLayerHandle } from "./vehicle-layer";
import {
  useVehicleAnimationActions,
  useVehicleAnimationLauncher,
  type VehicleAnimationDefinition,
} from "./vehicle-actions";

/**
 * The engine of a vehicle animation: it fetches the route, owns the map layer
 * and reports loading and failure back into the channel.
 *
 * It brings no route of its own. A route that wants one on the map declares it
 * in full in the config; a route that mounts the bare kind gets an idle engine
 * that a workflow card launches a vehicle into, through
 * `useVehicleAnimationLauncher`. There is no implicit demo.
 *
 * The component draws no panel and, by default, no control button: the
 * animation announces itself with its row in the layer bar.
 */

export type VehicleAnimationConfig = Partial<VehicleAnimationDefinition> & {
  /** whether a config-declared route goes on the map at mount. Default: true */
  startEnabled?: boolean;
  /**
   * Whether the control column gets a button toggling the animation. Default:
   * false; the layer-bar row is the addon's face, the button is opt-in.
   */
  showControl?: boolean;
  /** Corner the button is registered in. Default: "topleft" */
  controlPosition?: Positions;
  /** Sort order within that corner. Default: 83 */
  controlOrder?: number;
  /** MapLibre layer the vehicle is inserted before, e.g. to sit under labels */
  beforeId?: string;
};

/** geoportal's topleft column: comparison 75, terrain 80, flow field 84, time series 85 */
const DEFAULT_CONTROL_POSITION: Positions = "topleft";
const DEFAULT_CONTROL_ORDER = 83;

const ON_COLOR = "#1677ff";
const OFF_COLOR = "#000000";

export const VehicleAnimation = ({
  config = {},
  libreMap,
}: AddonComponentProps<"vehicleAnimation">) => {
  const {
    title,
    trackUrl: configTrackUrl,
    lengthMeters: configLengthMeters,
    widthMeters: configWidthMeters,
    speedKmh: configSpeedKmh,
    mode: configMode,
    fillColor: configFillColor,
    outlineColor: configOutlineColor,
    opacity: configOpacity,
    showTrack: configShowTrack,
    trackColor: configTrackColor,
    startEnabled = true,
    showControl = false,
    controlPosition = DEFAULT_CONTROL_POSITION,
    controlOrder = DEFAULT_CONTROL_ORDER,
    beforeId,
  } = config;

  const {
    isOn,
    toggle,
    trackUrl,
    lengthMeters,
    widthMeters,
    speedKmh,
    mode,
    fillColor,
    outlineColor,
    opacity,
    showTrack,
    trackColor,
    isPaused,
    setOn,
    setLoading,
    setError,
    setTrackLength,
  } = useVehicleAnimationActions();

  const { startVehicle } = useVehicleAnimationLauncher();

  const [track, setTrack] = useState<Track | null>(null);
  const layerRef = useRef<VehicleLayerHandle | null>(null);

  // read the live values without making the mount effect depend on them, which
  // would tear the layer down and rebuild it on every nudge
  const opacityRef = useRef(opacity);
  opacityRef.current = opacity;
  const pausedRef = useRef(isPaused);
  pausedRef.current = isPaused;
  const speedRef = useRef(speedKmh);
  speedRef.current = speedKmh;

  /**
   * A route that declares its vehicle in full gets it on the map at mount; the
   * teardown takes it off again, so suspending the kind in the addon manager
   * does not leave the layer-bar row behind. A config without a route makes
   * this a no-op and the engine idles until a workflow launches one.
   */
  useEffect(() => {
    if (!startEnabled || !configTrackUrl) {
      return undefined;
    }
    startVehicle({
      title: title ?? "Fahrzeug",
      trackUrl: configTrackUrl,
      lengthMeters: configLengthMeters,
      widthMeters: configWidthMeters,
      speedKmh: configSpeedKmh,
      mode: configMode,
      fillColor: configFillColor,
      outlineColor: configOutlineColor,
      opacity: configOpacity,
      showTrack: configShowTrack,
      trackColor: configTrackColor,
    });
    return () => setOn(false);
  }, [
    startEnabled,
    title,
    configTrackUrl,
    configLengthMeters,
    configWidthMeters,
    configSpeedKmh,
    configMode,
    configFillColor,
    configOutlineColor,
    configOpacity,
    configShowTrack,
    configTrackColor,
    startVehicle,
    setOn,
  ]);

  // Fetch and stitch the route. Separate from the layer, because the same route
  // survives a pause, an opacity change and a basemap swap, and re-reading a
  // few thousand coordinates for any of those would be waste.
  useEffect(() => {
    if (!isOn || !trackUrl) {
      setTrack(null);
      return undefined;
    }

    const controller = new AbortController();
    let disposed = false;

    setLoading(true);
    setError(null);

    fetch(trackUrl, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText}`);
        }
        return response.json();
      })
      .then((geojson: unknown) => {
        if (disposed) return;
        const built = buildTrack(geojson);
        if (!built) {
          throw new Error("no line geometry in the route");
        }
        setTrack(built);
        setTrackLength(Math.round(built.length));
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (disposed || controller.signal.aborted) return;
        console.error("[VEHICLE ANIMATION] route request failed", error);
        setTrack(null);
        setLoading(false);
        setError(error instanceof Error ? error.message : "unbekannter Fehler");
      });

    return () => {
      disposed = true;
      controller.abort();
    };
  }, [isOn, trackUrl, setLoading, setError, setTrackLength]);

  // Mount the moving body. Every value the layer cannot be told about later is
  // a dependency, so changing one rebuilds the layer and the vehicle restarts
  // from the beginning of the route; speed, opacity and pausing are pushed
  // down instead and leave it where it is.
  useEffect(() => {
    if (!libreMap || !isOn || !track) {
      return undefined;
    }

    const handle = createVehicleLayer({
      map: libreMap,
      track,
      lengthMeters,
      widthMeters,
      speedKmh: speedRef.current,
      mode,
      fillColor,
      outlineColor,
      opacity: opacityRef.current,
      showTrack,
      trackColor,
      beforeId,
    });
    handle.setPaused(pausedRef.current);
    layerRef.current = handle;

    return () => {
      handle.destroy();
      layerRef.current = null;
    };
  }, [
    libreMap,
    isOn,
    track,
    lengthMeters,
    widthMeters,
    mode,
    fillColor,
    outlineColor,
    showTrack,
    trackColor,
    beforeId,
  ]);

  // Push the live values down separately, so changing one never rebuilds the
  // layer and the vehicle keeps its place on the route.
  useEffect(() => {
    layerRef.current?.setSpeed(speedKmh);
  }, [speedKmh]);

  useEffect(() => {
    layerRef.current?.setOpacity(opacity);
  }, [opacity]);

  useEffect(() => {
    layerRef.current?.setPaused(isPaused);
  }, [isPaused]);

  if (!libreMap || !showControl) {
    return null;
  }

  return (
    <Control position={controlPosition} order={controlOrder}>
      <Tooltip
        title={isOn ? "Animation ausblenden" : "Animation anzeigen"}
        placement="right"
      >
        <ControlButtonStyler
          onClick={toggle}
          dataTestId="vehicle-animation-control"
        >
          <FontAwesomeIcon
            icon={faTrain}
            style={{ color: isOn ? ON_COLOR : OFF_COLOR }}
          />
        </ControlButtonStyler>
      </Tooltip>
    </Control>
  );
};
