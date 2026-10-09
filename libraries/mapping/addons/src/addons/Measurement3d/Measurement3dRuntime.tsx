import { useCallback, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import type { Map as MaplibreMap } from "maplibre-gl";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLink } from "@fortawesome/free-solid-svg-icons";
import { Tooltip, message } from "antd";
import {
  ANNOTATION_SELECT_TOOL_ID,
  ANNOTATION_TYPES,
  isManagedAnnotationKeyboardEvent,
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
import { useMapLibreAnnotationEngine } from "@carma-mapping/annotations/maplibre";
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
} from "@carma-mapping/annotations/runtime";
import type { AnnotationToolbarTool } from "@carma-mapping/annotations/ui";
import { useMeasurement3dPanelHost } from "./measurement3d-panel-host";
import {
  buildMeasurement3dShareUrl,
  decodeMeasurement3dShareParam,
  readMeasurement3dShareParam,
} from "./measurement3d-share";
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

/** Measurements from the URL hash join the runtime once, existing ids win. */
const Measurement3dShareImport = () => {
  const { appendAnnotationsRuntimePersistenceState } = useAnnotationsRuntime();
  const importedRef = useRef(false);
  useEffect(() => {
    if (importedRef.current) return;
    importedRef.current = true;
    const param = readMeasurement3dShareParam();
    const envelope = param ? decodeMeasurement3dShareParam(param) : null;
    if (envelope) {
      appendAnnotationsRuntimePersistenceState(envelope, {
        skipExisting: true,
      });
    }
  }, [appendAnnotationsRuntimePersistenceState]);
  return null;
};

const MEASUREMENT3D_SHARE_TEXT = Object.freeze({
  tooltip: "Link mit allen Messungen kopieren",
  copied: "Link mit den Messungen kopiert",
  prompt: "Link mit den Messungen",
});

/** Copies a link that carries every current measurement in its hash. */
const Measurement3dShareLinkButton = () => {
  const { annotationEntries, buildAllAnnotationsGeoJson } =
    useAnnotationsRuntime();
  const count = selectAuthoringAnnotationEntries({ annotationEntries }).length;
  const copy = useCallback(async () => {
    const url = buildMeasurement3dShareUrl(buildAllAnnotationsGeoJson());
    try {
      await navigator.clipboard.writeText(url);
      message.success(MEASUREMENT3D_SHARE_TEXT.copied);
    } catch {
      window.prompt(MEASUREMENT3D_SHARE_TEXT.prompt, url);
    }
  }, [buildAllAnnotationsGeoJson]);
  return (
    <Tooltip title={MEASUREMENT3D_SHARE_TEXT.tooltip} placement="bottom">
      <button
        type="button"
        className={`${TOOLBAR_CLASS_NAMES.toolButtonBase} ${TOOLBAR_CLASS_NAMES.toolButtonInactive} disabled:opacity-40`}
        disabled={count === 0}
        onClick={copy}
        data-test-id="measurement3d-share-link"
      >
        <FontAwesomeIcon icon={faLink} />
      </button>
    </Tooltip>
  );
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
    <div className="flex items-center gap-2">
      <RuntimeAnnotationsToolbar
        plugins={plugins}
        classNames={TOOLBAR_CLASS_NAMES}
        disableSelectWithoutAnnotations
        tooltipPlacement="bottom"
        renderToolButtonBackdrop={renderToolButtonBackdrop}
      />
      <Measurement3dShareLinkButton />
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
      {engine !== null ? <Measurement3dShareImport /> : null}
      {active ? <Measurement3dToolbarPortal plugins={visiblePlugins} /> : null}
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
