import { useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTrain } from "@fortawesome/free-solid-svg-icons";
import { Tooltip } from "antd";

import { claimClick } from "@carma-mapping/engines/maplibre";
import {
  Control,
  ControlButtonStyler,
  type Positions,
} from "@carma-mapping/map-controls-layout";

import type { AddonComponentProps } from "../../lib/registry";
import type { FleetTimetable } from "./fleet";
import { parseStructureAsset, type StructureAsset } from "./geruest";
import { parseTimetable, type Timetable } from "./timetable";
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
/** a press that moved further than this is a drag, not a click; MapLibre's own tolerance */
const CLICK_TOLERANCE_PX = 3;

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
    timetableUrl,
    renderer,
    isHidden,
    isPaused,
    focusRequest,
    selectedCar,
    setOn,
    setLoading,
    setError,
    setTrackLength,
    setFleetSize,
    setSelectedCar,
  } = useVehicleAnimationActions();

  const { startVehicle } = useVehicleAnimationLauncher();

  const [track, setTrack] = useState<Track | null>(null);
  const [structure, setStructure] = useState<StructureAsset | null>(null);
  const [timetable, setTimetable] = useState<Timetable | null>(null);
  const layerRef = useRef<VehicleLayerHandle | null>(null);

  // read the live values without making the mount effect depend on them, which
  // would tear the layer down and rebuild it on every nudge
  const opacityRef = useRef(opacity);
  opacityRef.current = opacity;
  const pausedRef = useRef(isPaused);
  pausedRef.current = isPaused;
  const hiddenRef = useRef(isHidden);
  hiddenRef.current = isHidden;
  const speedRef = useRef(speedKmh);
  speedRef.current = speedKmh;
  const setSelectedCarRef = useRef(setSelectedCar);
  setSelectedCarRef.current = setSelectedCar;

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
    timetableUrl: configTimetableUrl,
    renderer: configRenderer,
    permanent: configPermanent,
  } = config;

  /** what this mount puts on the map, or null when the engine only idles */
  const configDefinition = useMemo<VehicleAnimationDefinition | null>(
    () =>
      configTrackUrl
        ? {
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
            timetableUrl: configTimetableUrl,
            renderer: configRenderer,
            permanent: configPermanent,
          }
        : null,
    [
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
      configTimetableUrl,
      configRenderer,
      configPermanent,
    ]
  );

  useEffect(() => {
    if (!startEnabled || !configDefinition) {
      return undefined;
    }
    startVehicle(configDefinition);
    return () => setOn(false);
  }, [startEnabled, configDefinition, startVehicle, setOn]);

  /**
   * A default workflow owns the channel whenever nothing else is using it.
   *
   * The channel holds one animation at a time, so a workflow card takes it over
   * while it runs. Switching that card off again (its ✕, or a second click on
   * the card) left the map bare until a reload, because the mount effect above
   * had long since run. Claiming the channel back here is what makes the
   * default behave like the app's own furniture rather than like a card that
   * happened to be launched first.
   *
   * Only on the transition to off, and only for a config the app declared
   * permanent: an idle engine a route mounts for its cards stays idle.
   */
  const wasOnRef = useRef(isOn);
  useEffect(() => {
    const wasOn = wasOnRef.current;
    wasOnRef.current = isOn;
    if (!isOn && wasOn && startEnabled && configPermanent && configDefinition) {
      startVehicle(configDefinition);
    }
  }, [isOn, startEnabled, configPermanent, configDefinition, startVehicle]);

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

  // The timetable is what a "nach Fahrplan" fleet runs on, so unlike the
  // structure it is not optional once asked for: a fleet that fell back to
  // its headway would look right and be wrong.
  useEffect(() => {
    if (!isOn || !timetableUrl) {
      setTimetable(null);
      return undefined;
    }

    const controller = new AbortController();
    let disposed = false;

    fetch(timetableUrl, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText}`);
        }
        return response.json();
      })
      .then((json: unknown) => {
        if (disposed) return;
        const parsed = parseTimetable(json);
        if (!parsed) throw new Error("not a timetable asset");
        setTimetable(parsed);
      })
      .catch((error: unknown) => {
        if (disposed || controller.signal.aborted) return;
        console.error("[VEHICLE ANIMATION] timetable request failed", error);
        setTimetable(null);
        setError(
          `Fahrplan fehlt: ${
            error instanceof Error ? error.message : "unbekannter Fehler"
          }`
        );
      });

    return () => {
      disposed = true;
      controller.abort();
    };
  }, [isOn, timetableUrl, setError]);

  const fleetTimetable = useMemo<FleetTimetable | null>(
    () => (timetable ? { timetable, dwellSeconds, stationRadiusMeters } : null),
    [timetable, dwellSeconds, stationRadiusMeters]
  );

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
        (widthMeters * CAR_SHAPE_GTW15.noseMeters) / CAR_SHAPE_GTW15.widthMeters
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
    // and a timetable that is still loading must not start a headway fleet
    if (timetableUrl && !fleetTimetable) {
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
            timetable: fleetTimetable,
            bodyColor,
            jointColor,
            opacity: opacityRef.current,
            structure,
            beforeId,
            onFleetSize: setFleetSize,
            onSelection: (car) => setSelectedCarRef.current(car),
          })
        : createVehicleLayer({
            map: libreMap,
            track,
            shape,
            speedKmh: speedRef.current,
            mode,
            schedule,
            timetable: fleetTimetable,
            bodyColor,
            jointColor,
            outlineColor,
            opacity: opacityRef.current,
            showTrack,
            trackColor,
            showStations:
              showStations && (schedule !== null || fleetTimetable !== null),
            structure,
            beforeId,
            onFleetSize: setFleetSize,
            onSelection: (car) => setSelectedCarRef.current(car),
          });
    handle.setPaused(pausedRef.current);
    // a layer rebuilt while the row is hidden must not come back on the map
    handle.setVisible(!hiddenRef.current);
    layerRef.current = handle;

    return () => {
      handle.destroy();
      layerRef.current = null;
      setFleetSize(0);
      setSelectedCarRef.current(null);
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
    fleetTimetable,
    timetableUrl,
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

  useEffect(() => {
    layerRef.current?.setVisible(!isHidden);
  }, [isHidden]);

  // the host closed its info box, or showed something else in it: the
  // highlight goes with it
  useEffect(() => {
    if (selectedCar === null) layerRef.current?.selectCar(null);
  }, [selectedCar]);

  // A click on a vehicle is answered here, before MapLibre dispatches it, so
  // the engine's own selection (WMS feature info and all) leaves it alone: a
  // capture listener on the canvas container runs ahead of MapLibre's own.
  // A press that moved is a drag ending on the canvas, not a click.
  useEffect(() => {
    if (!libreMap) return undefined;
    const container = libreMap.getCanvasContainer();
    let pressedAt: { x: number; y: number } | null = null;

    const onPointerDown = (event: PointerEvent): void => {
      pressedAt = { x: event.clientX, y: event.clientY };
    };
    const onClick = (event: MouseEvent): void => {
      const handle = layerRef.current;
      if (!handle) return;
      if (
        pressedAt &&
        Math.hypot(event.clientX - pressedAt.x, event.clientY - pressedAt.y) >
          CLICK_TOLERANCE_PX
      ) {
        return;
      }
      const rect = libreMap.getCanvas().getBoundingClientRect();
      const index = handle.pickCarAt({
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
      if (index === null) return;
      claimClick(event);
      handle.selectCar(index);
    };

    container.addEventListener("pointerdown", onPointerDown, true);
    container.addEventListener("click", onClick, true);
    return () => {
      container.removeEventListener("pointerdown", onPointerDown, true);
      container.removeEventListener("click", onClick, true);
    };
  }, [libreMap]);

  // Someone asked to be shown a vehicle: the one nearest to where the view
  // is. The first value is whatever the channel starts at, so it is only
  // recorded, never flown to: a fresh animation must not move the map on its
  // own.
  //
  // The flight goes through the app's camera rather than through this
  // MapLibre map. Moving the map object directly would move only that one, and
  // the framework rendering beside it would stay where it was. No zoom is
  // passed, so the view arrives at the vehicle at whatever scale it was on.
  const handledFocusRef = useRef(focusRequest);
  useEffect(() => {
    if (handledFocusRef.current === focusRequest) return;
    handledFocusRef.current = focusRequest;
    const center = libreMap?.getCenter();
    const at = center
      ? layerRef.current?.pickNearestCar(center.lng, center.lat)
      : null;
    if (at) carma.mapping2D.flyTo(at.lat, at.lon);
  }, [focusRequest, carma, libreMap]);

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
