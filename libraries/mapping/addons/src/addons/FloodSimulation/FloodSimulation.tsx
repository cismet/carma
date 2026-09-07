import { useEffect, useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faHouseFloodWater } from "@fortawesome/free-solid-svg-icons";
import { Tooltip } from "antd";

import {
  Control,
  ControlButtonStyler,
  type Positions,
} from "@carma-mapping/map-controls-layout";

import type { AddonComponentProps } from "../../lib/registry";
import {
  useFloodActions,
  useFloodLauncher,
  type FloodDefinition,
} from "./flood-actions";
import { createFloodLayer, type FloodLayerHandle } from "./flood-layer";
import { resolveTerrainSource } from "./terrain-patch";

/**
 * The engine of the flood: it owns the water layer and keeps it at the level
 * the channel holds.
 *
 * It brings no flood of its own. A route that wants one on the map at mount
 * says `startEnabled`; a route that mounts the bare kind gets an idle engine
 * that a workflow card launches a flood into, through `useFloodLauncher`.
 *
 * The component draws no panel and, by default, no control button: the flood
 * announces itself with its row in the layer bar, and the row opens the
 * slider.
 */

export type FloodSimulationConfig = Partial<FloodDefinition> & {
  /** whether the flood goes on the map at mount. Default: false */
  startEnabled?: boolean;
  /**
   * Whether the control column gets a button toggling the flood. Default:
   * false; the layer-bar row is the addon's face, the button is opt-in.
   */
  showControl?: boolean;
  /** Corner the button is registered in. Default: "topleft" */
  controlPosition?: Positions;
  /** Sort order within that corner. Default: 83 */
  controlOrder?: number;
  /** MapLibre layer the water is inserted before, e.g. to sit under labels */
  beforeId?: string;
  /**
   * Whether the water moves, which keeps the map repainting while it does.
   * Default: true.
   */
  animate?: boolean;
  /**
   * `localStorage` entry the flood is kept in across reloads. Default: one
   * entry shared by every route (`FLOOD_STATE_STORAGE_KEY`); a route that
   * wants its own flood names one here.
   */
  storageKey?: string;
};

/** geoportal's topleft column: highlighting 70, comparison 75, terrain 80, time series 85 */
const DEFAULT_CONTROL_POSITION: Positions = "topleft";
const DEFAULT_CONTROL_ORDER = 83;

/** far below any ground, so the shader discards everything until a real level arrives */
const PLACEHOLDER_LEVEL = -1e9;

const ON_COLOR = "#1677ff";
const OFF_COLOR = "#000000";

export const FloodSimulation = ({
  config = {},
  libreMap,
}: AddonComponentProps<"floodSimulation">) => {
  const {
    title,
    terrain: configTerrain,
    level: configLevel,
    range: configRange,
    opacity: configOpacity,
    look: configLook,
    startEnabled = false,
    showControl = false,
    controlPosition = DEFAULT_CONTROL_POSITION,
    controlOrder = DEFAULT_CONTROL_ORDER,
    beforeId,
    animate = true,
  } = config;

  const {
    isOn,
    toggle,
    terrain,
    level,
    opacity,
    look,
    setOn,
    setRangeFromGround,
    setLoading,
  } = useFloodActions();
  const { startFlood } = useFloodLauncher();

  const layerRef = useRef<FloodLayerHandle | null>(null);

  // read live values without making the mount effect depend on them, which
  // would tear the layer down and rebuild it on every slider nudge
  const levelRef = useRef(level);
  levelRef.current = level;
  const opacityRef = useRef(opacity);
  opacityRef.current = opacity;
  const lookRef = useRef(look);
  lookRef.current = look;

  /**
   * A route that asks for the flood at mount gets it; the teardown takes it
   * off again, so suspending the kind in the addon manager does not leave the
   * layer-bar row behind.
   */
  useEffect(() => {
    if (!startEnabled) {
      return undefined;
    }
    startFlood({
      title: title ?? "Hochwasser",
      terrain: configTerrain,
      level: configLevel,
      range: configRange,
      opacity: configOpacity,
      look: configLook,
    });
    return () => setOn(false);
  }, [
    startEnabled,
    title,
    configTerrain,
    configLevel,
    configRange,
    configOpacity,
    configLook,
    startFlood,
    setOn,
  ]);

  // Mount the water layer while the flood is on. The level is pushed down
  // separately, so moving the slider never rebuilds the layer.
  useEffect(() => {
    if (!libreMap || !isOn) {
      return undefined;
    }

    let disposed = false;
    const handle = createFloodLayer({
      map: libreMap,
      terrain: resolveTerrainSource(terrain),
      // the level is unknown until the first patch reports the ground; the
      // quad stays hidden until then, so the placeholder never draws
      level: levelRef.current ?? PLACEHOLDER_LEVEL,
      opacity: opacityRef.current,
      look: lookRef.current,
      beforeId,
      animate,
      onPatch: ({ minHeight, maxHeight, hasData }) => {
        if (disposed || !hasData) return;
        setRangeFromGround(minHeight, maxHeight);
      },
      onLoadingChange: (loading) => {
        if (!disposed) setLoading(loading);
      },
      onError: (error) => {
        console.error("[FLOOD] terrain tile request failed", error);
      },
    });
    layerRef.current = handle;

    return () => {
      disposed = true;
      handle.destroy();
      layerRef.current = null;
      setLoading(false);
    };
  }, [libreMap, isOn, terrain, beforeId, animate, setRangeFromGround, setLoading]);

  useEffect(() => {
    if (level !== null) {
      layerRef.current?.setLevel(level);
    }
  }, [level]);

  useEffect(() => {
    layerRef.current?.setOpacity(opacity);
  }, [opacity]);

  useEffect(() => {
    layerRef.current?.setLook(look);
  }, [look]);

  if (!libreMap || !showControl) {
    return null;
  }

  return (
    <Control position={controlPosition} order={controlOrder}>
      <Tooltip
        title={isOn ? "Hochwasser ausblenden" : "Hochwasser anzeigen"}
        placement="right"
      >
        <ControlButtonStyler
          onClick={toggle}
          dataTestId="flood-simulation-control"
        >
          <FontAwesomeIcon
            icon={faHouseFloodWater}
            style={{ color: isOn ? ON_COLOR : OFF_COLOR }}
          />
        </ControlButtonStyler>
      </Tooltip>
    </Control>
  );
};
