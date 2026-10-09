import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import type { Map as MaplibreMap } from "maplibre-gl";
import { Modal } from "antd";
import { REFERENCE_OBJECT_SCALING_MODES } from "@carma-commons/math";
import {
  ANNOTATION_SELECT_TOOL_ID,
  ANNOTATION_TYPES,
  isManagedAnnotationKeyboardEvent,
  type AnnotationAreaPaletteOptions,
  type AnnotationToolId,
} from "@carma-mapping/annotations/core";
import {
  DevelopmentOnlyUiBackdrop,
  type DevelopmentOnlyUiBackdropStyleOptions,
} from "@carma-commons/ui/components";
import {
  createDefaultAnnotationToolPlugins,
  defaultAnnotationToolTexts,
} from "@carma-mapping/annotations/builtin-tools";
import {
  useMapLibreAnnotationEngine,
  useMapLibreAnnotationOverlayHost,
  type MapLibreAnnotationEngineOptions,
  type MapLibreAreaFillStyleOptions,
} from "@carma-mapping/annotations/maplibre";
import {
  AnnotationsProvider,
  RuntimeAnnotationInfoBox,
  RuntimeAnnotationsToolbar,
  resolveAnnotationToolShortcutTarget,
  resolvePrimaryAnnotationInteractionToolId,
  resolveVisibleMeasurementAnnotationToolPlugins,
  selectAuthoringAnnotationEntries,
  useAnnotationsRuntime,
  type AnnotationLineStyleOptions,
  type AnnotationReferenceObjectSizingOptions,
  type AnnotationToolPlugin,
  type AnnotationsToolbarClassNames,
  type AreaOcclusionStyleOptions,
  SharedAnnotationsImport,
  type AnnotationDeleteConfirmationRequester,
  type SharedAnnotationsConflict,
  type SharedAnnotationsConflictDecision,
} from "@carma-mapping/annotations/runtime";
import type { AnnotationToolbarTool } from "@carma-mapping/annotations/ui";
import { Measurement3dLabelTextModal } from "./Measurement3dLabelTextModal";
import { useMeasurement3dPanelHost } from "./measurement3d-panel-host";
import { useMeasurement3dActions } from "./measurement3d-state";
import { setMeasurement3dRuntimeServices } from "./measurement3d-runtime-services";
import { MEASUREMENT3D_TEXT } from "./measurement3d-layer-row";


export type Measurement3dConfig = {
  /** Persistence key of the measurements; share it with a Cesium host to keep one set. */
  storageKey?: string;
  /** Control-column placement of the on/off button. */
  position?: "topleft" | "topright" | "bottomleft" | "bottomright";
  order?: number;
  /** The tool settings; every part is optional and combines with the others. */
  style?: {
    lines?: AnnotationLineStyleOptions;
    areaOcclusion?: AreaOcclusionStyleOptions;
    /** Colours and alphas of the area fills per area type. */
    area?: AnnotationAreaPaletteOptions;
    /** The pattern of the area fills and the ruler of the lines in the scene. */
    areaFill?: MapLibreAreaFillStyleOptions;
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
  /**
   * The point query disc keeps a world size and only steps it (1, 2, 5, 10,
   * 20 m diameters) when the view changes enough: within a factor of two of
   * the screen target it stays, so a static camera never resizes it.
   */
  referenceObjectSizing: {
    scalingMode: REFERENCE_OBJECT_SCALING_MODES.WORLD,
    worldRadiusMeters: 3,
    targetScreenRadiusCssPx: 48,
    resizeWorldRadiusToScreenTarget: true,
    resizeStepFactor: 2,
    quantizeWorldRadius: true,
  } satisfies AnnotationReferenceObjectSizingOptions,
  /**
   * The geoportal Cesium measurement style, except that area fills stay in
   * the scene: the MapLibre engine draws the part behind a surface itself,
   * so no DOM overlay fill doubles it. Occluded area edges are dashed.
   */
  style: {
    lines: { strokeWidthPx: 1.5, overlayDashPattern: "8 8" },
    areaOcclusion: {
      fill: { overlay: false },
      line: { overlayDashed: true },
    },
  } satisfies {
    lines: AnnotationLineStyleOptions;
    areaOcclusion: AreaOcclusionStyleOptions;
  },
});

/** The finished tools; the rest shows only with `showAllTools`, hatched. */
export const MEASUREMENT3D_STABLE_TOOL_IDS: readonly AnnotationToolId[] = [
  ANNOTATION_SELECT_TOOL_ID,
  ANNOTATION_TYPES.POINT,
  ANNOTATION_TYPES.DISTANCE,
];

const STABLE_TOOL_ID_SET = new Set<string>(MEASUREMENT3D_STABLE_TOOL_IDS);

/** The geoportal layer-bar look of the tool buttons. */
const TOOLBAR_CLASS_NAMES = {
  toolButtonBase:
    "flex h-8 w-12 min-w-12 items-center justify-center rounded-[10px] bg-white px-2 transition-colors [&_svg]:text-current",
  toolButtonActive: "!text-[#1677ff] hover:!text-[#1677ff] !shadow-none",
  toolButtonInactive: "text-gray-600 hover:!text-gray-500 button-shadow",
  toolButtonIcon:
    "inline-flex items-center justify-center text-base leading-none [&_svg]:text-current",
} satisfies Partial<AnnotationsToolbarClassNames>;

const DEVELOPMENT_PREVIEW_PATTERN_OPTIONS = {
  backgroundColor: "transparent",
  primaryColor: "rgba(0, 0, 0, 0.1)",
  rotationDeg: 45,
  secondaryColor: "transparent",
  stripeGapPx: 5,
  stripeWidthPx: 5,
  textVisible: false,
} satisfies DevelopmentOnlyUiBackdropStyleOptions;

const renderToolButtonBackdrop = (tool: AnnotationToolbarTool) =>
  STABLE_TOOL_ID_SET.has(tool.id) ? null : (
    <DevelopmentOnlyUiBackdrop
      patternOptions={DEVELOPMENT_PREVIEW_PATTERN_OPTIONS}
    />
  );

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

/** The runtime services the host uses outside this provider, while it is mounted. */
const Measurement3dRuntimeServicesSync = () => {
  const {
    annotationEntries,
    nodes,
    engine,
    setSelectedAnnotationId,
    appendAnnotationsRuntimePersistenceState,
    removeExternalAnnotationsByCollection,
    buildAllAnnotationsGeoJson,
    removeAnnotationsByIds,
    flyToAllAnnotations,
    exportAllAnnotationsGeoJson,
  } = useAnnotationsRuntime();
  useEffect(() => {
    setMeasurement3dRuntimeServices({
      annotationEntries,
      nodes,
      engine,
      setSelectedAnnotationId,
      appendAnnotationsRuntimePersistenceState,
      removeExternalAnnotationsByCollection,
      buildAllAnnotationsGeoJson,
      removeAnnotationsByIds,
      flyToAllAnnotations,
      exportAllAnnotationsGeoJson,
    });
  }, [
    annotationEntries,
    appendAnnotationsRuntimePersistenceState,
    buildAllAnnotationsGeoJson,
    engine,
    exportAllAnnotationsGeoJson,
    flyToAllAnnotations,
    nodes,
    removeAnnotationsByIds,
    removeExternalAnnotationsByCollection,
    setSelectedAnnotationId,
  ]);
  useEffect(() => () => setMeasurement3dRuntimeServices(null), []);
  return null;
};

/** The host's dialog before measurements go: the Cesium view asks the same. */
const confirmMeasurementDelete: AnnotationDeleteConfirmationRequester = ({
  annotations,
}) =>
  annotations.length === 0
    ? false
    : new Promise<boolean>((resolve) => {
        Modal.confirm({
          title: MEASUREMENT3D_TEXT.deleteConfirm.title,
          content:
            annotations.length === 1
              ? MEASUREMENT3D_TEXT.deleteConfirm.one
              : MEASUREMENT3D_TEXT.deleteConfirm.many(annotations.length),
          okText: MEASUREMENT3D_TEXT.deleteConfirm.ok,
          okButtonProps: { danger: true },
          cancelText: MEASUREMENT3D_TEXT.deleteConfirm.cancel,
          onOk: () => resolve(true),
          onCancel: () => resolve(false),
        });
      });

const SHARED_MEASUREMENTS_TEXT = Object.freeze({
  title: "Geteilte Messungen weichen ab",
  body: (count: number) =>
    `${count} geteilte ${count === 1 ? "Messung unterscheidet" : "Messungen unterscheiden"} sich von ${count === 1 ? "der lokalen" : "den lokalen"}.`,
  update: "Lokale aktualisieren",
  discard: "Neue verwerfen",
});

/** The host's answer for shared measurements that changed locally held ones. */
export const confirmSharedMeasurementsConflicts = (
  conflicts: readonly SharedAnnotationsConflict[]
): Promise<SharedAnnotationsConflictDecision> =>
  new Promise((resolve) => {
    Modal.confirm({
      title: SHARED_MEASUREMENTS_TEXT.title,
      content: SHARED_MEASUREMENTS_TEXT.body(conflicts.length),
      okText: SHARED_MEASUREMENTS_TEXT.update,
      cancelText: SHARED_MEASUREMENTS_TEXT.discard,
      onOk: () => resolve("update"),
      onCancel: () => resolve("discard"),
    });
  });


/** The toolbar, portalled into the ribbon the host renders for the row. */
const Measurement3dToolbarPortal = ({
  plugins,
}: {
  plugins: readonly AnnotationToolPlugin[];
}) => {
  const host = useMeasurement3dPanelHost();
  if (!host) return null;
  return createPortal(
    <div className="flex items-center gap-2">
      <RuntimeAnnotationsToolbar
        plugins={plugins}
        classNames={TOOLBAR_CLASS_NAMES}
        disableSelectWithoutAnnotations
        tooltipPlacement="bottom"
        renderToolButtonBackdrop={renderToolButtonBackdrop}
      />
    </div>,
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
  const { isOn, available, showAllTools } = useMeasurement3dActions();
  const areaFill = config?.style?.areaFill;
  const engineOptions = useMemo<MapLibreAnnotationEngineOptions>(
    () => ({ areaFill }),
    [areaFill]
  );
  const engine = useMapLibreAnnotationEngine(
    available ? map : null,
    engineOptions
  );
  const {
    overlayContainer,
    overlayHost,
    ready: overlayReady,
  } = useMapLibreAnnotationOverlayHost(map);
  const plugins = useMemo(
    () =>
      createDefaultAnnotationToolPlugins({
        annotationLineStyle:
          config?.style?.lines ?? MEASUREMENT3D_DEFAULTS.style.lines,
        areaOcclusionStyle:
          config?.style?.areaOcclusion ??
          MEASUREMENT3D_DEFAULTS.style.areaOcclusion,
        areaStyle: config?.style?.area,
        texts: defaultAnnotationToolTexts,
      }),
    [config?.style?.area, config?.style?.areaOcclusion, config?.style?.lines]
  );
  const visiblePlugins = useMemo(
    () =>
      resolveVisibleMeasurementAnnotationToolPlugins(plugins, {
        toolIds: showAllTools ? undefined : MEASUREMENT3D_STABLE_TOOL_IDS,
      }),
    [plugins, showAllTools]
  );
  // Labels mount into the overlay root, so rendering waits for it to exist.
  const active = isOn && available && engine !== null && overlayReady;
  return (
    <AnnotationsProvider
      engine={engine}
      plugins={plugins}
      annotationOverlayContainer={overlayContainer}
      labelOverlayHost={overlayHost}
      confirmAnnotationDelete={confirmMeasurementDelete}
      initialActiveToolType={ANNOTATION_TYPES.DISTANCE}
      referenceObjectSizing={
        config?.referenceObjectSizing ?? MEASUREMENT3D_DEFAULTS.referenceObjectSizing
      }
      localPersistence={{
        storageKey: config?.storageKey ?? MEASUREMENT3D_DEFAULTS.storageKey,
      }}
      renderEnabled={active}
      visualRenderEnabled={active}
      visualInteractionEnabled={active}
    >
      <Measurement3dCountSync />
      {active ? (
        <Measurement3dRuntimeServicesSync />
      ) : null}
      {active ? (
        <SharedAnnotationsImport
          consumerKey={config?.storageKey ?? MEASUREMENT3D_DEFAULTS.storageKey}
          confirmConflicts={confirmSharedMeasurementsConflicts}
        />
      ) : null}
      {active ? <Measurement3dToolbarPortal plugins={visiblePlugins} /> : null}
      {active ? <Measurement3dShortcutBindings /> : null}
      {active ? <Measurement3dLabelTextModal /> : null}
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
