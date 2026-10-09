import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import type { Map as MaplibreMap } from "maplibre-gl";
import {
  ANNOTATION_TYPES,
  isManagedAnnotationKeyboardEvent,
} from "@carma-mapping/annotations/core";
import {
  createDefaultAnnotationToolPlugins,
  defaultAnnotationToolTexts,
} from "@carma-mapping/annotations/builtin-tools";
import { useMapLibreAnnotationEngine } from "@carma-mapping/annotations/maplibre";
import {
  AnnotationsProvider,
  RuntimeAnnotationInfoBox,
  RuntimeAnnotationsToolbar,
  resolveAnnotationToolShortcutTarget,
  resolvePrimaryAnnotationInteractionToolId,
  selectAuthoringAnnotationEntries,
  useAnnotationsRuntime,
  type AnnotationLineStyleOptions,
  type AnnotationReferenceObjectSizingOptions,
  type AnnotationToolPlugin,
  type AreaOcclusionStyleOptions,
} from "@carma-mapping/annotations/runtime";
import { useMeasurement3dPanelHost } from "./measurement3d-panel-host";
import { useMeasurement3dActions } from "./measurement3d-state";
import { useMeasurement3dOverlayHost } from "./use-measurement3d-overlay-host";

export type Measurement3dConfig = {
  /** Persistence key of the measurements; share it with a Cesium host to keep one set. */
  storageKey?: string;
  /** Control-column placement of the on/off button. */
  position?: "topleft" | "topright" | "bottomleft" | "bottomright";
  order?: number;
  style?: {
    lines?: AnnotationLineStyleOptions;
    areaOcclusion?: AreaOcclusionStyleOptions;
  };
  referenceObjectSizing?: AnnotationReferenceObjectSizingOptions;
  infoBox?: {
    pixelWidth?: number;
    controlOrder?: number;
  };
};

export const MEASUREMENT3D_DEFAULTS = Object.freeze({
  storageKey: "carma::measurement3d::annotations",
  infoBox: { pixelWidth: 350, controlOrder: 12 },
});

/** Keeps the channel's count in step with the authored measurements. */
const Measurement3dCountSync = () => {
  const { annotationEntries } = useAnnotationsRuntime();
  const { setCount } = useMeasurement3dActions();
  const count = selectAuthoringAnnotationEntries({ annotationEntries }).length;
  useEffect(() => {
    setCount(count);
  }, [count, setCount]);
  return null;
};

/** The toolbar, portalled into the ribbon the host renders for the row. */
const Measurement3dToolbarPortal = ({
  plugins,
}: {
  plugins: readonly AnnotationToolPlugin[];
}) => {
  const host = useMeasurement3dPanelHost();
  if (!host) return null;
  return createPortal(
    <RuntimeAnnotationsToolbar
      plugins={plugins}
      disableSelectWithoutAnnotations
      tooltipPlacement="bottom"
    />,
    host
  );
};

/** Port of the geoportal's tool shortcut bindings, active while the tool is on. */
const Measurement3dShortcutBindings = () => {
  const { registry, activeToolType, requestModeChange } =
    useAnnotationsRuntime();
  const descriptors = useMemo(
    () => registry.plugins.map((plugin) => plugin.descriptor),
    [registry.plugins]
  );
  const primaryInteractionToolId = useMemo(
    () => resolvePrimaryAnnotationInteractionToolId(registry.plugins),
    [registry.plugins]
  );
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isManagedAnnotationKeyboardEvent(event)) return;
      const targetToolType = resolveAnnotationToolShortcutTarget(
        event.key,
        descriptors,
        primaryInteractionToolId
      );
      if (!targetToolType || targetToolType === activeToolType) return;
      event.preventDefault();
      event.stopPropagation();
      requestModeChange(targetToolType);
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [
    activeToolType,
    descriptors,
    primaryInteractionToolId,
    requestModeChange,
  ]);
  return null;
};

type Measurement3dRuntimeProps = {
  map: MaplibreMap;
  config?: Measurement3dConfig;
};

/**
 * The annotation runtime on the MapLibre map: the shared runtime with the
 * MapLibre + Three.js engine, its overlays in the map container, the toolbar
 * in the row's ribbon and the info box in the control layout.
 */
export const Measurement3dRuntime = ({
  map,
  config,
}: Measurement3dRuntimeProps) => {
  const { isOn, available } = useMeasurement3dActions();
  const engine = useMapLibreAnnotationEngine(available ? map : null);
  const {
    overlayContainer,
    overlayHost,
    ready: overlayReady,
  } = useMeasurement3dOverlayHost(map);
  const plugins = useMemo(
    () =>
      createDefaultAnnotationToolPlugins({
        annotationLineStyle: config?.style?.lines,
        areaOcclusionStyle: config?.style?.areaOcclusion,
        texts: defaultAnnotationToolTexts,
      }),
    [config?.style?.areaOcclusion, config?.style?.lines]
  );
  // Labels mount into the overlay root, so rendering waits for it to exist.
  const active = isOn && engine !== null && overlayReady;
  return (
    <AnnotationsProvider
      engine={engine}
      plugins={plugins}
      annotationOverlayContainer={overlayContainer}
      labelOverlayHost={overlayHost}
      initialActiveToolType={ANNOTATION_TYPES.DISTANCE}
      referenceObjectSizing={config?.referenceObjectSizing}
      localPersistence={{
        storageKey: config?.storageKey ?? MEASUREMENT3D_DEFAULTS.storageKey,
      }}
      renderEnabled={active}
      visualRenderEnabled={active}
      visualInteractionEnabled={active}
    >
      <Measurement3dCountSync />
      {active ? <Measurement3dToolbarPortal plugins={plugins} /> : null}
      {active ? <Measurement3dShortcutBindings /> : null}
      {active ? (
        <RuntimeAnnotationInfoBox
          useControlLayout
          controlPosition="bottomright"
          controlOrder={
            config?.infoBox?.controlOrder ??
            MEASUREMENT3D_DEFAULTS.infoBox.controlOrder
          }
          pixelWidth={
            config?.infoBox?.pixelWidth ??
            MEASUREMENT3D_DEFAULTS.infoBox.pixelWidth
          }
        />
      ) : null}
    </AnnotationsProvider>
  );
};
