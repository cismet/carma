import { useMemo, useState } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";
import { ANNOTATION_TYPES } from "@carma-mapping/annotations/core";
import {
  createDefaultAnnotationToolPlugins,
  defaultAnnotationToolTexts,
  resolveAnnotationModeText,
} from "@carma-mapping/annotations/builtin-tools";
import {
  useMapLibreAnnotationEngine,
  useMapLibreAnnotationOverlayHost,
  type MapLibreAnnotationEngineOptions,
} from "@carma-mapping/annotations/maplibre";
import {
  ANNOTATION_ENTRY_ROLES,
  AnnotationToolShortcutBindings,
  AnnotationsProvider,
  RuntimeAnnotationInfoBox,
  resolveVisibleMeasurementAnnotationToolPlugins,
  SharedAnnotationsImport,
  useAnnotationLabelTextDialogState,
} from "@carma-mapping/annotations/runtime";
import {
  AnnotationLabelTextModal,
  STABLE_ANNOTATION_TOOL_IDS,
  confirmSharedAnnotationsConflicts,
} from "@carma-mapping/annotations/ui";
import {
  MEASUREMENT3D_DEFAULTS,
  type Measurement3dConfig,
} from "./measurement3d-config";
import { Measurement3dEntriesSync } from "./Measurement3dEntriesSync";
import { useMeasurement3dHostUi } from "./measurement3d-host";
import { Measurement3dRuntimeServicesSync } from "./Measurement3dRuntimeServicesSync";
import { Measurement3dToolbarPortal } from "./Measurement3dToolbar";
import { useMeasurement3dActions } from "./measurement3d-state";

const EXTERNAL_ANNOTATION_ENTRY_ROLES = [
  ANNOTATION_ENTRY_ROLES.EXTERNAL,
] as const;

const LABEL_TEXT_MODAL_TEXT = resolveAnnotationModeText().labelTextModal;

const LabelTextModal = () => {
  const dialog = useAnnotationLabelTextDialogState();
  return (
    <AnnotationLabelTextModal
      {...dialog}
      texts={LABEL_TEXT_MODAL_TEXT}
      inputDataTestId="measurement3d-label-text-input"
    />
  );
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
  const measurementStyle = config?.style?.scene;
  const engineOptions = useMemo<MapLibreAnnotationEngineOptions>(
    () => ({ measurementStyle }),
    [measurementStyle]
  );
  const engine = useMapLibreAnnotationEngine(
    available ? map : null,
    engineOptions
  );
  const {
    overlayContainer,
    overlayHost,
    ready: overlayReady,
  } = useMapLibreAnnotationOverlayHost(map, engine);
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
        ...(config?.toolBehavior ?? MEASUREMENT3D_DEFAULTS.toolBehavior),
      }),
    [
      config?.style?.area,
      config?.style?.areaOcclusion,
      config?.style?.lines,
      config?.toolBehavior,
    ]
  );
  const referenceObjectSizing = useMemo(
    () => ({
      ...MEASUREMENT3D_DEFAULTS.referenceObjectSizing,
      ...config?.referenceObjectSizing,
      pointQueryDiscSizing: {
        ...MEASUREMENT3D_DEFAULTS.referenceObjectSizing.pointQueryDiscSizing,
        ...config?.referenceObjectSizing?.pointQueryDiscSizing,
      },
    }),
    [config?.referenceObjectSizing]
  );
  const visiblePlugins = useMemo(
    () =>
      resolveVisibleMeasurementAnnotationToolPlugins(plugins, {
        toolIds: showAllTools ? undefined : STABLE_ANNOTATION_TOOL_IDS,
      }),
    [plugins, showAllTools]
  );
  // Labels mount into the overlay root, so rendering waits for it to exist.
  const ready = available && engine !== null && overlayReady;
  const active = isOn && ready;
  // Saved sets stay on screen with the tool off, read-only and selectable,
  // like the saved measurements of the Cesium view.
  const [hasSavedSet, setHasSavedSet] = useState(false);
  const showSavedSets = ready && !active && hasSavedSet;
  const hostUi = useMeasurement3dHostUi();
  const HostInfoBox = hostUi?.InfoBox;
  const storageKey = config?.storageKey ?? MEASUREMENT3D_DEFAULTS.storageKey;
  const infoBoxControlOrder =
    config?.infoBox?.controlOrder ??
    MEASUREMENT3D_DEFAULTS.infoBox.controlOrder;
  const infoBoxPixelWidth =
    config?.infoBox?.pixelWidth ?? MEASUREMENT3D_DEFAULTS.infoBox.pixelWidth;
  return (
    <AnnotationsProvider
      engine={engine}
      plugins={plugins}
      annotationOverlayContainer={overlayContainer}
      labelOverlayHost={overlayHost}
      confirmAnnotationDelete={hostUi?.confirmDelete}
      initialActiveToolType={ANNOTATION_TYPES.DISTANCE}
      referenceObjectSizing={referenceObjectSizing}
      localPersistence={{ storageKey }}
      renderEnabled={active}
      visualRenderEnabled={active || showSavedSets}
      visualAnnotationEntryRoles={
        showSavedSets ? EXTERNAL_ANNOTATION_ENTRY_ROLES : undefined
      }
      visualInteractionEnabled={active || showSavedSets}
    >
      <Measurement3dEntriesSync onSavedSetPresence={setHasSavedSet} />
      {/* The host saves, syncs saved sets and lists their rows through these
          whenever the view can show measurements, the tool on or off. */}
      {ready ? <Measurement3dRuntimeServicesSync /> : null}
      {active ? (
        <SharedAnnotationsImport
          consumerKey={storageKey}
          confirmConflicts={confirmSharedAnnotationsConflicts}
        />
      ) : null}
      {active ? <Measurement3dToolbarPortal plugins={visiblePlugins} /> : null}
      {active ? (
        <AnnotationToolShortcutBindings plugins={visiblePlugins} />
      ) : null}
      {active ? <LabelTextModal /> : null}
      {active || showSavedSets ? (
        HostInfoBox ? (
          <HostInfoBox
            authoring={active}
            controlOrder={infoBoxControlOrder}
            pixelWidth={infoBoxPixelWidth}
          />
        ) : (
          <RuntimeAnnotationInfoBox
            useControlLayout
            controlPosition="bottomright"
            controlOrder={infoBoxControlOrder}
            pixelWidth={infoBoxPixelWidth}
          />
        )
      ) : null}
    </AnnotationsProvider>
  );
};
