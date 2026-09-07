import { useEffect, useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faWater } from "@fortawesome/free-solid-svg-icons";
import { Tooltip } from "antd";

import {
  Control,
  ControlButtonStyler,
  type Positions,
} from "@carma-mapping/map-controls-layout";

import {
  useCreateFlowLayer,
  type FlowLayerHandle,
} from "../../lib/caged-addons";
import type { AddonComponentProps } from "../../lib/registry";
import {
  createBackdropLayer,
  type BackdropLayerHandle,
} from "./backdrop-layer";
import {
  useFlowFieldActions,
  useFlowFieldLauncher,
  type FlowFieldDefinition,
} from "./flowfield-actions";

/**
 * The engine of a flow-field animation: it owns the map layer and reports the
 * zoom gate back into the channel.
 *
 * It brings no scenario of its own. A route that wants one on the map declares
 * it in full in the config; a route that mounts the bare kind gets an idle
 * engine that a workflow card launches a scenario into, through
 * `useFlowFieldLauncher`. There is no implicit demo.
 *
 * Unlike the time series this has no open fallback. The whole animation is
 * caged, so without cage the engine mounts nothing at all and the map is simply
 * as it was. The backdrop raster is the exception: it is ordinary WMS and is
 * drawn either way, since it is the rain hazard map's standing-water layer
 * rather than part of the animation.
 *
 * The component draws no panel and, by default, no control button: the
 * animation announces itself with its row in the layer bar.
 */

export type FlowFieldConfig = Partial<FlowFieldDefinition> & {
  /** whether a config-declared scenario goes on the map at mount. Default: true */
  startEnabled?: boolean;
  /**
   * Whether the control column gets a button toggling the animation. Default:
   * false; the layer-bar row is the addon's face, the button is opt-in.
   */
  showControl?: boolean;
  /** Corner the button is registered in. Default: "topleft" */
  controlPosition?: Positions;
  /** Sort order within that corner. Default: 84 */
  controlOrder?: number;
  /**
   * MapLibre layer the backdrop raster is inserted before, e.g. to sit under
   * labels. The particles are a canvas over the whole map and always on top,
   * as they were on the Leaflet overlay pane, so this does not reach them.
   */
  beforeId?: string;
  /**
   * `localStorage` key the launched scenario is kept under, so it is back on
   * the map after a reload. Default: one key shared by every route.
   */
  storageKey?: string;
};

/** geoportal's topleft column: highlighting 70, comparison 75, terrain 80, time series 85 */
const DEFAULT_CONTROL_POSITION: Positions = "topleft";
const DEFAULT_CONTROL_ORDER = 84;

/** the layer id of the stand-in WMS drawn while cage is absent */
const FALLBACK_LAYER_ID = "flow-field-fallback";

const ON_COLOR = "#1677ff";
const OFF_COLOR = "#000000";

export const FlowField = ({
  config = {},
  libreMap,
}: AddonComponentProps<"flowField">) => {
  const {
    title,
    service: configService,
    scenario: configScenario,
    layerPostfix: configLayerPostfix,
    uvCorrection: configUvCorrection,
    minZoom: configMinZoom,
    animateWhileMoving: configAnimateWhileMoving,
    opacity: configOpacity,
    params: configParams,
    backdrop: configBackdrop,
    fallback: configFallback,
    startEnabled = true,
    showControl = false,
    controlPosition = DEFAULT_CONTROL_POSITION,
    controlOrder = DEFAULT_CONTROL_ORDER,
    beforeId,
  } = config;

  const {
    isOn,
    toggle,
    service,
    scenario,
    layerPostfix,
    uvCorrection,
    minZoom,
    animateWhileMoving,
    opacity,
    params,
    backdrop,
    fallback,
    setOn,
    setActive,
    setLoading,
  } = useFlowFieldActions();

  const { startField } = useFlowFieldLauncher();

  // the flag-aware factory, so `?ff=nocage` exercises the absent case without
  // unlinking the cage submodule
  const createFlowLayer = useCreateFlowLayer();

  const layerRef = useRef<FlowLayerHandle | null>(null);
  const backdropRef = useRef<BackdropLayerHandle | null>(null);
  const fallbackRef = useRef<BackdropLayerHandle | null>(null);

  // read the live opacity without making the mount effect depend on it, which
  // would tear the layer down and rebuild it on every slider nudge
  const opacityRef = useRef(opacity);
  opacityRef.current = opacity;

  /**
   * A route that declares its scenario in full gets it on the map at mount;
   * the teardown takes it off again, so suspending the kind in the addon
   * manager does not leave the layer-bar row behind. A config without a
   * scenario makes this a no-op and the engine idles until a workflow launches
   * one.
   */
  useEffect(() => {
    if (!startEnabled || !configService || !configScenario) {
      return undefined;
    }
    startField({
      title: title ?? "Fließwege",
      service: configService,
      scenario: configScenario,
      layerPostfix: configLayerPostfix,
      uvCorrection: configUvCorrection,
      minZoom: configMinZoom,
      animateWhileMoving: configAnimateWhileMoving,
      opacity: configOpacity,
      params: configParams,
      backdrop: configBackdrop,
      fallback: configFallback,
    });
    return () => setOn(false);
  }, [
    startEnabled,
    title,
    configService,
    configScenario,
    configLayerPostfix,
    configUvCorrection,
    configMinZoom,
    configAnimateWhileMoving,
    configOpacity,
    configParams,
    configBackdrop,
    configFallback,
    startField,
    setOn,
  ]);

  // The backdrop is independent of cage, so it mounts on its own. Added first
  // so the particles, added after, paint over it.
  useEffect(() => {
    if (!libreMap || !isOn || !backdrop) {
      return undefined;
    }
    backdropRef.current = createBackdropLayer({
      map: libreMap,
      wmsUrl: backdrop.wmsUrl,
      layers: backdrop.layers,
      styles: backdrop.styles,
      opacity: backdrop.opacity,
      beforeId,
    });
    return () => {
      backdropRef.current?.destroy();
      backdropRef.current = null;
    };
  }, [libreMap, isOn, backdrop, beforeId]);

  // Without cage nothing animates. A route or card that declares a `fallback`
  // gets that WMS instead, the scenario's direction arrows in the rain hazard
  // map's case; with cage present this effect never mounts anything.
  useEffect(() => {
    if (!libreMap || !isOn || createFlowLayer || !fallback) {
      return undefined;
    }
    fallbackRef.current = createBackdropLayer({
      map: libreMap,
      wmsUrl: fallback.wmsUrl,
      layers: fallback.layers,
      styles: fallback.styles,
      opacity: fallback.opacity,
      beforeId,
      id: FALLBACK_LAYER_ID,
    });
    return () => {
      fallbackRef.current?.destroy();
      fallbackRef.current = null;
    };
  }, [libreMap, isOn, createFlowLayer, fallback, beforeId]);

  // Mount the caged particle layer. Without cage `createFlowLayer` is
  // undefined and this whole effect is a no-op, which is the intended
  // degradation: no animation, and the `fallback` above if one is declared.
  useEffect(() => {
    if (!libreMap || !isOn || !createFlowLayer || !service || !scenario) {
      return undefined;
    }

    let disposed = false;
    const handle = createFlowLayer({
      map: libreMap,
      service,
      scenario,
      layerPostfix,
      uvCorrection,
      minZoom,
      animateWhileMoving,
      params,
      onActiveChange: (active) => {
        if (!disposed) setActive(active);
      },
      onLoadingChange: (loading) => {
        if (!disposed) setLoading(loading);
      },
      onError: (error) => {
        console.error("[FLOW FIELD] velocity field request failed", error);
      },
    });
    handle.setOpacity(opacityRef.current);
    layerRef.current = handle;

    return () => {
      disposed = true;
      handle.destroy();
      layerRef.current = null;
      // the gate state belongs to a layer that no longer exists
      setActive(false);
      setLoading(false);
    };
  }, [
    libreMap,
    isOn,
    createFlowLayer,
    service,
    scenario,
    layerPostfix,
    uvCorrection,
    minZoom,
    animateWhileMoving,
    params,
    setActive,
    setLoading,
  ]);

  // Push opacity down separately, so changing it never rebuilds the layer.
  useEffect(() => {
    layerRef.current?.setOpacity(opacity);
    backdropRef.current?.setOpacity(
      (backdrop?.opacity ?? 0.85) * opacity
    );
    fallbackRef.current?.setOpacity(
      (fallback?.opacity ?? 0.85) * opacity
    );
  }, [opacity, backdrop, fallback]);

  if (!libreMap || !showControl) {
    return null;
  }

  return (
    <Control position={controlPosition} order={controlOrder}>
      <Tooltip
        title={isOn ? "Fließwege ausblenden" : "Fließwege anzeigen"}
        placement="right"
      >
        <ControlButtonStyler onClick={toggle} dataTestId="flow-field-control">
          <FontAwesomeIcon
            icon={faWater}
            style={{ color: isOn ? ON_COLOR : OFF_COLOR }}
          />
        </ControlButtonStyler>
      </Tooltip>
    </Control>
  );
};
