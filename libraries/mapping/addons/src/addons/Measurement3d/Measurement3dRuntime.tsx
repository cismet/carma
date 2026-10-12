import { useMemo, useState } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";
import { ANNOTATION_TYPES } from "@carma-mapping/annotations/core";
import {
  createDefaultAnnotationToolPlugins,
  defaultAnnotationToolTexts,
} from "@carma-mapping/annotations/builtin-tools";
import {
  useMapLibreAnnotationEngine,
  useMapLibreAnnotationOverlayHost,
  type MapLibreAnnotationEngineOptions,
} from "@carma-mapping/annotations/maplibre";
import {
  ANNOTATION_ENTRY_ROLES,
  AnnotationsProvider,
  RuntimeAnnotationInfoBox,
  resolveVisibleMeasurementAnnotationToolPlugins,
  SharedAnnotationsImport,
} from "@carma-mapping/annotations/runtime";
import { STABLE_ANNOTATION_TOOL_IDS } from "@carma-mapping/annotations/ui";
import {
  MEASUREMENT3D_DEFAULTS,
  type Measurement3dConfig,
} from "./measurement3d-config";
import {
  confirmMeasurementDelete,
  confirmSharedMeasurementsConflicts,
} from "./measurement3d-dialogs";
import { useMeasurement3dInfoBox } from "./measurement3d-info-box";
import { Measurement3dLabelTextModal } from "./Measurement3dLabelTextModal";
import {
  Measurement3dCountSync,
  Measurement3dRuntimeServicesSync,
  Measurement3dSavedSetPresenceSync,
  Measurement3dShortcutBindings,
} from "./Measurement3dSyncs";
import { Measurement3dToolbarPortal } from "./Measurement3dToolbar";
import { useMeasurement3dActions } from "./measurement3d-state";

const EXTERNAL_ANNOTATION_ENTRY_ROLES = [
  ANNOTATION_ENTRY_ROLES.EXTERNAL,
] as const;

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
  const HostInfoBox = useMeasurement3dInfoBox();
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
      confirmAnnotationDelete={confirmMeasurementDelete}
      initialActiveToolType={ANNOTATION_TYPES.DISTANCE}
      referenceObjectSizing={
        config?.referenceObjectSizing ??
        MEASUREMENT3D_DEFAULTS.referenceObjectSizing
      }
      localPersistence={{ storageKey }}
      renderEnabled={active}
      visualRenderEnabled={active || showSavedSets}
      visualAnnotationEntryRoles={
        showSavedSets ? EXTERNAL_ANNOTATION_ENTRY_ROLES : undefined
      }
      visualInteractionEnabled={active || showSavedSets}
    >
      <Measurement3dCountSync />
      <Measurement3dSavedSetPresenceSync onChange={setHasSavedSet} />
      {/* The host saves, syncs saved sets and lists their rows through these
          whenever the view can show measurements, the tool on or off. */}
      {ready ? <Measurement3dRuntimeServicesSync /> : null}
      {active ? (
        <SharedAnnotationsImport
          consumerKey={storageKey}
          confirmConflicts={confirmSharedMeasurementsConflicts}
        />
      ) : null}
      {active ? <Measurement3dToolbarPortal plugins={visiblePlugins} /> : null}
      {active ? <Measurement3dShortcutBindings /> : null}
      {active ? <Measurement3dLabelTextModal /> : null}
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
