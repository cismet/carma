import { useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTrain } from "@fortawesome/free-solid-svg-icons";
import { Tooltip } from "antd";

import {
  Control,
  ControlButtonStyler,
  type Positions,
} from "@carma-mapping/map-controls-layout";

import type { AddonComponentProps } from "../../lib/registry";
import { parseStructureAsset, type StructureAsset } from "./geruest";
import {
  CAR_SHAPE_GTW15,
  buildTrack,
  type CarShape,
  type Track,
} from "./track";
import {
  createVehicleLayer,
  type VehicleLayerHandle,
  type VehicleSchedule,
} from "./vehicle-layer";
import { createVehicleThreeLayer } from "./vehicle-three-layer";
import {
  useVehicleAnimationActions,
  useVehicleAnimationLauncher,
  type VehicleAnimationDefinition,
} from "./vehicle-actions";

/**
 * The engine of a vehicle animation: it fetches the route, owns the map layer
 * and reports loading, failure and the fleet size back into the channel.
 *
 * It brings no route of its own. A route that wants one on the map declares it
 * in full in the config; a route that mounts the bare kind gets an idle engine
 * that a workflow card launches a service into, through
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
  /** MapLibre layer the fleet is inserted before, e.g. to sit under labels */
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
  carma,
}: AddonComponentProps<"vehicleAnimation">) => {
  const {
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
    sectionShares,
    jointMeters,
    speedKmh,
    mode,
    headwaySeconds,
    dwellSeconds,
    stations,
    stationRadiusMeters,
    showStations,
    bodyColor,
    jointColor,
    outlineColor,
    opacity,
    showTrack,
    trackColor,
    structureUrl,
    renderer,
    isPaused,
    focusRequest,
    setOn,
    setLoading,
    setError,
    setTrackLength,
    setFleetSize,
  } = useVehicleAnimationActions();

  const { startVehicle } = useVehicleAnimationLauncher();

  const [track, setTrack] = useState<Track | null>(null);
  const [structure, setStructure] = useState<StructureAsset | null>(null);
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
   * A route that declares its service in full gets it on the map at mount; the
   * teardown takes it off again, so suspending the kind in the addon manager
   * does not leave the layer-bar row behind. A config without a route makes
   * this a no-op and the engine idles until a workflow launches one.
   */
  const {
    title: configTitle,
    trackUrl: configTrackUrl,
    lengthMeters: configLengthMeters,
    widthMeters: configWidthMeters,
    sectionShares: configSectionShares,
    jointMeters: configJointMeters,
    speedKmh: configSpeedKmh,
    mode: configMode,
    schedule: configSchedule,
    bodyColor: configBodyColor,
    jointColor: configJointColor,
    outlineColor: configOutlineColor,
    opacity: configOpacity,
    showTrack: configShowTrack,
    trackColor: configTrackColor,
    structureUrl: configStructureUrl,
    renderer: configRenderer,
  } = config;

  useEffect(() => {
    if (!startEnabled || !configTrackUrl) {
      return undefined;
    }
    startVehicle({
      title: configTitle ?? "Fahrzeug",
      trackUrl: configTrackUrl,
      lengthMeters: configLengthMeters,
      widthMeters: configWidthMeters,
      sectionShares: configSectionShares,
      jointMeters: configJointMeters,
      speedKmh: configSpeedKmh,
      mode: configMode,
      schedule: configSchedule,
      bodyColor: configBodyColor,
      jointColor: configJointColor,
      outlineColor: configOutlineColor,
      opacity: configOpacity,
      showTrack: configShowTrack,
      trackColor: configTrackColor,
      structureUrl: configStructureUrl,
      renderer: configRenderer,
    });
    return () => setOn(false);
  }, [
    startEnabled,
    configTitle,
    configTrackUrl,
    configLengthMeters,
    configWidthMeters,
    configSectionShares,
    configJointMeters,
    configSpeedKmh,
    configMode,
    configSchedule,
    configBodyColor,
    configJointColor,
    configOutlineColor,
    configOpacity,
    configShowTrack,
    configTrackColor,
    configStructureUrl,
    configRenderer,
    startVehicle,
    setOn,
  ]);

  // Fetch and stitch the route. Separate from the layer, because the same route
  // survives a hold, an opacity change and a basemap swap, and re-reading a few
  // thousand coordinates for any of those would be waste.
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

  // The structure is optional and separate: a fleet without one runs as soon
  // as its route is in, and a structure that fails to load costs the map the
  // Gerüst, not the vehicles.
  useEffect(() => {
    if (!isOn || !structureUrl) {
      setStructure(null);
      return undefined;
    }

    const controller = new AbortController();
    let disposed = false;

    fetch(structureUrl, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText}`);
        }
        return response.json();
      })
      .then((json: unknown) => {
        if (disposed) return;
        const parsed = parseStructureAsset(json);
        if (!parsed) throw new Error("not a structure asset");
        setStructure(parsed);
      })
      .catch((error: unknown) => {
        if (disposed || controller.signal.aborted) return;
        console.error("[VEHICLE ANIMATION] structure request failed", error);
        setStructure(null);
      });

    return () => {
      disposed = true;
      controller.abort();
    };
  }, [isOn, structureUrl]);

  const shape = useMemo<CarShape>(
    () => ({
      lengthMeters,
      widthMeters,
      sectionShares,
      jointMeters,
      // the nose is a rounded corner, so it scales with the width, not the length
      noseWidth: CAR_SHAPE_GTW15.noseWidth,
      noseMeters: Math.min(
        CAR_SHAPE_GTW15.noseMeters,
        widthMeters * CAR_SHAPE_GTW15.noseMeters / CAR_SHAPE_GTW15.widthMeters
      ),
    }),
    [lengthMeters, widthMeters, sectionShares, jointMeters]
  );

  const schedule = useMemo<VehicleSchedule | null>(
    () =>
      headwaySeconds > 0 && stations.length > 0
        ? {
            headwaySeconds,
            dwellSeconds,
            stations,
            stationRadiusMeters,
          }
        : null,
    [headwaySeconds, dwellSeconds, stations, stationRadiusMeters]
  );

  // Mount the fleet. Every value the layer cannot be told about later is a
  // dependency, so changing one rebuilds the layer and the vehicles start over;
  // speed, opacity and holding are pushed down instead and leave them running.
  useEffect(() => {
    if (!libreMap || !isOn || !track) {
      return undefined;
    }

    // a structure that is still loading would otherwise start the 3D fleet
    // twice, once bare and once under its girders
    if (renderer === "three" && structureUrl && !structure) {
      return undefined;
    }

    const handle =
      renderer === "three"
        ? createVehicleThreeLayer({
            map: libreMap,
            track,
            shape,
            speedKmh: speedRef.current,
            mode,
            schedule,
            bodyColor,
            jointColor,
            opacity: opacityRef.current,
            structure,
            beforeId,
            onFleetSize: setFleetSize,
          })
        : createVehicleLayer({
            map: libreMap,
            track,
            shape,
            speedKmh: speedRef.current,
            mode,
            schedule,
            bodyColor,
            jointColor,
            outlineColor,
            opacity: opacityRef.current,
            showTrack,
            trackColor,
            showStations: showStations && schedule !== null,
            structure,
            beforeId,
            onFleetSize: setFleetSize,
          });
    handle.setPaused(pausedRef.current);
    layerRef.current = handle;

    return () => {
      handle.destroy();
      layerRef.current = null;
      setFleetSize(0);
    };
  }, [
    libreMap,
    isOn,
    track,
    shape,
    mode,
    schedule,
    bodyColor,
    jointColor,
    outlineColor,
    showTrack,
    trackColor,
    showStations,
    structure,
    structureUrl,
    renderer,
    beforeId,
    setFleetSize,
  ]);

  // Push the live values down separately, so changing one never rebuilds the
  // layer and the vehicles keep their place on the route.
  useEffect(() => {
    layerRef.current?.setSpeed(speedKmh);
  }, [speedKmh]);

  useEffect(() => {
    layerRef.current?.setOpacity(opacity);
  }, [opacity]);

  useEffect(() => {
    layerRef.current?.setPaused(isPaused);
  }, [isPaused]);

  // Someone asked to be shown a vehicle. The first value is whatever the
  // channel starts at, so it is only recorded, never flown to: a fresh
  // animation must not move the map on its own.
  //
  // The flight goes through the app's camera rather than through this
  // MapLibre map. Moving the map object directly would move only that one, and
  // the framework rendering beside it would stay where it was. No zoom is
  // passed, so the view arrives at the vehicle at whatever scale it was on.
  const handledFocusRef = useRef(focusRequest);
  useEffect(() => {
    if (handledFocusRef.current === focusRequest) return;
    handledFocusRef.current = focusRequest;
    const at = layerRef.current?.pickRandomCar();
    if (at) carma.mapping2D.flyTo(at.lat, at.lon);
  }, [focusRequest, carma]);

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
