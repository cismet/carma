import { useEffect, useRef, useState } from "react";
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
import { placeAtSlot, useStyleSlot } from "../../lib/style-slot";
import {
  BACKDROP_LAYER_ID,
  createBackdropLayer,
  type BackdropLayerHandle,
} from "./backdrop-layer";
import {
  createFlowSlotLayer,
  type FlowSlotLayerHandle,
} from "./flow-slot-layer";
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
   * labels. It does not reach the particles; what places them is a style's
   * `flowField` slot (`style-slot.ts`), and without one they are on top.
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

/** the class name carma gives cage's particle canvas, to find it by */
const PARTICLES_CANVAS_CLASS = "flow-field-particles";

/** the custom layer the particle canvas is drawn through */
const PARTICLES_LAYER_ID = "flow-field-particles-layer";

/**
 * What a style's slot holds, bottom to top: the scenario's raster, the arrows
 * standing in for cage, the particles.
 */
const SLOT_LAYER_IDS = [
  BACKDROP_LAYER_ID,
  FALLBACK_LAYER_ID,
  PARTICLES_LAYER_ID,
];

/** the name of the placeholder a style marks the particles' place with */
const FLOW_FIELD_SLOT = "flowField";

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
    viewportBuffer: configViewportBuffer,
    debounceMs: configDebounceMs,
    occlusion: configOcclusion,
    maxFps: configMaxFps,
    params: configParams,
    backdrop: configBackdrop,
    fallback: configFallback,
    permanent: configPermanent,
    anchorLayerId: configAnchorLayerId,
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
    viewportBuffer,
    debounceMs,
    occlusion,
    maxFps,
    params,
    backdrop,
    fallback,
    anchorLayerId,
    isHidden,
    setOn,
    setActive,
    setLoading,
  } = useFlowFieldActions();

  const { startField } = useFlowFieldLauncher();

  // the flag-aware factory, so `?ff=nocage` exercises the absent case without
  // unlinking the cage submodule
  const createFlowLayer = useCreateFlowLayer();

  const layerRef = useRef<FlowLayerHandle | null>(null);
  // the same handle as state, for the effect that wraps its canvas
  const [particles, setParticles] = useState<FlowLayerHandle | null>(null);
  const slotLayerRef = useRef<FlowSlotLayerHandle | null>(null);
  const backdropRef = useRef<BackdropLayerHandle | null>(null);
  const fallbackRef = useRef<BackdropLayerHandle | null>(null);

  // read the live opacity without making the mount effect depend on it, which
  // would tear the layer down and rebuild it on every slider nudge
  const opacityRef = useRef(opacity);
  opacityRef.current = opacity;

  // Where a style wants the particles. The style's own opacity slider reaches
  // its layers through their paint; the particles, backdrop and arrows are not
  // its layers, so it reaches them through the placeholder.
  const slot = useStyleSlot(libreMap, FLOW_FIELD_SLOT, anchorLayerId);
  const isHiddenRef = useRef(isHidden);
  isHiddenRef.current = isHidden;
  const slotOpacity = slot?.opacity ?? 1;
  const slotOpacityRef = useRef(slotOpacity);
  slotOpacityRef.current = slotOpacity;
  const maxFpsRef = useRef(maxFps);
  maxFpsRef.current = maxFps;

  // The same for the drawing parameters. The caged layer takes them through
  // `setParams` without refetching anything, so a tuning slider must not reach
  // the mount effect: a rebuild there would ask the rasterfari for the
  // velocity field again on every pixel of the drag.
  const paramsRef = useRef(params);
  paramsRef.current = params;

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
      viewportBuffer: configViewportBuffer,
      debounceMs: configDebounceMs,
      occlusion: configOcclusion,
      maxFps: configMaxFps,
      params: configParams,
      backdrop: configBackdrop,
      fallback: configFallback,
      permanent: configPermanent,
      anchorLayerId: configAnchorLayerId,
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
    configViewportBuffer,
    configDebounceMs,
    configOcclusion,
    configMaxFps,
    configParams,
    configBackdrop,
    configFallback,
    configPermanent,
    configAnchorLayerId,
    startField,
    setOn,
  ]);

  // The backdrop is independent of cage, so it mounts on its own. Added first
  // so the particles, added after, paint over it.
  useEffect(() => {
    if (!libreMap || !isOn || isHidden || !backdrop) {
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
  }, [libreMap, isOn, isHidden, backdrop, beforeId]);

  // Without cage nothing animates. A route or card that declares a `fallback`
  // gets that WMS instead, the scenario's direction arrows in the rain hazard
  // map's case; with cage present this effect never mounts anything.
  useEffect(() => {
    if (!libreMap || !isOn || isHidden || createFlowLayer || !fallback) {
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
  }, [libreMap, isOn, isHidden, createFlowLayer, fallback, beforeId]);

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
      viewportBuffer,
      debounceMs,
      occlusion,
      params: paramsRef.current,
      id: PARTICLES_CANVAS_CLASS,
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
    layerRef.current = handle;
    setParticles(handle);

    // cage's canvas, an overlay on top of everything until a slot wraps it
    handle.setOpacity(opacityRef.current * slotOpacityRef.current);
    if (isHiddenRef.current) {
      handle.setVisible(false);
    }

    return () => {
      disposed = true;
      slotLayerRef.current?.destroy();
      slotLayerRef.current = null;
      handle.destroy();
      layerRef.current = null;
      setParticles(null);
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
    viewportBuffer,
    debounceMs,
    occlusion,
    setActive,
    setLoading,
  ]);

  /**
   * Push the drawing parameters down separately, for the reason `paramsRef`
   * states. Sent whole rather than as the keys that changed: `setParams` merges
   * into what the layer holds, so a key going back to cage's default has to be
   * sent as that default or the layer would keep the tuned value.
   */
  useEffect(() => {
    layerRef.current?.setParams(params);
  }, [params]);

  useEffect(() => {
    slotLayerRef.current?.setMaxFps(maxFps);
  }, [maxFps]);

  // The eye of the launching layer: the particles stop and go off the map,
  // and stay launched, so they are back the moment the eye is.
  useEffect(() => {
    layerRef.current?.setVisible(!isHidden);
    slotLayerRef.current?.setVisible(!isHidden);
  }, [isHidden]);

  // Push opacity down separately, so changing it never rebuilds the layer.
  useEffect(() => {
    const total = opacity * slotOpacity;
    if (slotLayerRef.current) {
      slotLayerRef.current.setOpacity(total);
    } else {
      layerRef.current?.setOpacity(total);
    }
    backdropRef.current?.setOpacity((backdrop?.opacity ?? 0.85) * total);
    fallbackRef.current?.setOpacity((fallback?.opacity ?? 0.85) * total);
  }, [opacity, slotOpacity, backdrop, fallback]);

  // Keep the particles, and whatever raster came with them, at the style's
  // slot. Each of them puts itself back on the map after a style swap, on top;
  // the swap and every reorder fire `styledata`, which moves them back under
  // the placeholder. Without a slot they stay where they were added.
  const placeholderId = slot?.placeholderId;
  useEffect(() => {
    if (!libreMap || !isOn || !placeholderId) {
      return undefined;
    }
    const place = () => placeAtSlot(libreMap, SLOT_LAYER_IDS, placeholderId);
    place();
    libreMap.on("styledata", place);
    return () => {
      libreMap.off("styledata", place);
    };
  }, [libreMap, isOn, placeholderId, createFlowLayer, backdrop, fallback]);

  // With a slot, draw cage's canvas as a layer of the map, so it has a place
  // in the layer order. Without one it stays the overlay it always was: a
  // layer placed nowhere would sit wherever it was added, under every layer
  // added after it. If cage ever stops putting the canvas where it is looked
  // for, the particles stay the overlay as well.
  const hasSlot = placeholderId !== undefined;
  useEffect(() => {
    if (!libreMap || !particles || !hasSlot) {
      return undefined;
    }
    const canvas = libreMap
      .getCanvasContainer()
      .querySelector<HTMLCanvasElement>(`canvas.${PARTICLES_CANVAS_CLASS}`);
    if (!canvas) {
      console.warn(
        "[FLOW FIELD] cage's particle canvas was not found; the particles " +
          "are drawn over the map instead of at their place in the layer order"
      );
      return undefined;
    }
    const slotLayer = createFlowSlotLayer({
      map: libreMap,
      canvas,
      id: PARTICLES_LAYER_ID,
      maxFps: maxFpsRef.current,
      isActive: () => particles.isActive(),
    });
    // the canvas is only the layer's source now; the layer does the fading
    particles.setOpacity(1);
    slotLayer.setOpacity(opacityRef.current * slotOpacityRef.current);
    slotLayer.setVisible(!isHiddenRef.current);
    slotLayerRef.current = slotLayer;
    return () => {
      // the mount effect's teardown may have been first, with the handle
      if (slotLayerRef.current !== slotLayer) return;
      slotLayer.destroy();
      slotLayerRef.current = null;
      particles.setOpacity(opacityRef.current * slotOpacityRef.current);
    };
  }, [libreMap, particles, hasSlot]);

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
