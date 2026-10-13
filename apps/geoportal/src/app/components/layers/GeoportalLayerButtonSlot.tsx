import {
  useCallback,
  useMemo,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { useDispatch, useSelector } from "react-redux";

import {
  faPause,
  faPlay,
  faTimes,
  faTrashCan,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Icon from "react-cismap/commons/Icon";

import { useMapMeasurementsContext } from "@carma-commons/measurements";
import {
  flyToAnnotationIds,
  type AnnotationsRuntimeGeoJsonFeatureCollection,
  useAnnotationsRuntime,
} from "@carma-mapping/annotations/runtime";
import { useMeasurements } from "@carma-mapping/measurements";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";
import {
  ShadowTextureHeaderControls,
  useAddonState,
  MEASUREMENT3D_LAYER_ID,
  useMeasurement3dRuntimeServices,
} from "@carma-mapping/addons";
import { MEASUREMENT_SERVICE_NAME } from "../../helper/adhoc-feature-utils";
import { useLibreMapEnabled } from "../../hooks/useLibreMapEnabled";

import { geoportalAnnotationModeText } from "../../config/geoportalTextConfig";

import {
  getSelectedLayerIndex,
  removeLayer,
  setSelectedLayerIndexNoSelection,
} from "../../store/slices/mapping";
import type { AppDispatch } from "../../store";
import {
  CESIUM_ANNOTATION_LAYER_ID,
  CESIUM_ANNOTATION_SAVE_INTERACTION_ID,
} from "../annotations/cesium-annotations.constants";
import { MeasurementDeleteConfirmationModal } from "../annotations/MeasurementDeleteConfirmationModal";
import { MEASUREMENT_LAYER_ID } from "../../hooks/useMeasurementLayerButton";
import {
  getShadowTextureLauncherId,
  SHADOW_SIMULATION_LAYER_ID,
  SHADOW_TEXTURE_LAYER_ID,
} from "../../hooks/useShadowSimulationLayerButton";
import { formatShadowSelection } from "@carma-mapping/shadow-simulation/core";
import {
  AdhocModelFlyToLayerbarAction,
  AdhocModelLayerbarActions,
} from "./AdhocModelLayerbarControls";
import GeoportalLayerButton, {
  type GeoportalLayerButtonProps,
} from "./GeoportalLayerButton";
import {
  LayerbarActionGroup,
  type LayerbarAction,
} from "./LayerbarActionGroup";
import { AnnotationLayerButton } from "./AnnotationLayerButton";
import { Measurement3dLayerButton } from "./Measurement3dLayerButton";
import type { LayerbarInteractionTarget } from "./use-layerbar-interaction-toggle";
import { LayerAddonTriggerButtons } from "./LayerAddonTriggerButtons";
import {
  normalizeAnnotationsRuntimeGeoJsonFeatureCollection,
  parseStyleObject,
  resolveAdhocFocusObjectLabel,
} from "./measurement-import-utils";

const CESIUM_ANNOTATION_SAVE_LAYERBAR_INTERACTION = {
  layerId: CESIUM_ANNOTATION_LAYER_ID,
  buttonId: CESIUM_ANNOTATION_SAVE_INTERACTION_ID,
} as const satisfies LayerbarInteractionTarget;

const useMeasurementLayerbarActions = (
  setShowDeleteConfirmation: (show: boolean) => void
) => {
  const { layerbar } = geoportalAnnotationModeText;
  const { shapes, clearAllShapes } = useMapMeasurementsContext();
  const isLibreMap = useLibreMapEnabled();
  const { clearAll: clearLibreMeasurements, count: libreCount } =
    useMeasurements();

  const measurementCount = isLibreMap ? libreCount : shapes.length;
  const clearMeasurements = isLibreMap
    ? clearLibreMeasurements
    : clearAllShapes;

  const actions: LayerbarAction[] = [
    {
      id: "delete-all",
      title: layerbar.leafletMeasurements.deleteAll,
      icon: <FontAwesomeIcon icon={faTrashCan} />,
      disabled: measurementCount === 0,
      onClick: (event) => {
        if (event.shiftKey) {
          clearMeasurements();
          return;
        }
        setShowDeleteConfirmation(true);
      },
    },
  ];

  return { actions, measurementCount, clearMeasurements };
};

const useSavedMeasurementLayerbarActions = ({
  layerId,
  focusObjectLabel,
}: {
  layerId: string;
  focusObjectLabel?: string | null;
}) => {
  // The saved set lives in the runtime of the view on screen: the Cesium
  // provider, or the 3D measurement addon of the MapLibre view.
  const cesiumRuntime = useAnnotationsRuntime();
  const measurement3dRuntime = useMeasurement3dRuntimeServices();
  const { isCesium } = useMapFrameworkSwitcherContext();
  const { annotationEntries, nodes, engine, setSelectedAnnotationId } =
    !isCesium && measurement3dRuntime ? measurement3dRuntime : cesiumRuntime;
  const {
    layerbar: { adhocModel },
  } = geoportalAnnotationModeText;

  const savedAnnotationIds = useMemo(
    () =>
      annotationEntries
        .filter(
          (annotationEntry) =>
            annotationEntry.externalCollection?.type === "saved-measurement" &&
            annotationEntry.externalCollection.id === layerId
        )
        .map((annotationEntry) => annotationEntry.id),
    [annotationEntries, layerId]
  );

  const handleFlyTo = useCallback(() => {
    setSelectedAnnotationId(savedAnnotationIds[0] ?? null);
    flyToAnnotationIds({
      annotationEntries,
      annotationIds: savedAnnotationIds,
      nodes,
      engine,
    });
  }, [
    annotationEntries,
    engine,
    nodes,
    savedAnnotationIds,
    setSelectedAnnotationId,
  ]);

  const actions: LayerbarAction[] = [
    {
      id: "focus-object",
      title: focusObjectLabel ?? adhocModel.actions.focusObject,
      icon: <Icon name="search-location" className="leading-none" />,
      disabled: savedAnnotationIds.length === 0,
      onClick: handleFlyTo,
    },
  ];

  return { actions };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const resolveSavedMeasurementAnnotationsGeoJson = (
  layer: GeoportalLayerButtonProps["layer"]
): AnnotationsRuntimeGeoJsonFeatureCollection | null => {
  const directMetadataCandidate = (layer as { metadata?: unknown }).metadata;
  if (
    isRecord(directMetadataCandidate) &&
    isRecord(directMetadataCandidate.carmaConf)
  ) {
    const annotationsGeoJson =
      normalizeAnnotationsRuntimeGeoJsonFeatureCollection(
        directMetadataCandidate.carmaConf.annotationsGeoJson
      );
    if (annotationsGeoJson) {
      return annotationsGeoJson;
    }
  }

  const styleData = parseStyleObject(
    (layer as { props?: { style?: unknown }; vectorStyle?: unknown }).props
      ?.style ?? (layer as { vectorStyle?: unknown }).vectorStyle
  );
  const styleMetadata = styleData?.metadata;
  if (isRecord(styleMetadata) && isRecord(styleMetadata.carmaConf)) {
    const annotationsGeoJson =
      normalizeAnnotationsRuntimeGeoJsonFeatureCollection(
        styleMetadata.carmaConf.annotationsGeoJson
      );
    if (annotationsGeoJson) {
      return annotationsGeoJson;
    }
  }

  const sources = styleData?.sources;
  if (!isRecord(sources)) {
    return null;
  }

  for (const source of Object.values(sources)) {
    if (isRecord(source)) {
      const annotationsGeoJson =
        normalizeAnnotationsRuntimeGeoJsonFeatureCollection(source.data);
      if (annotationsGeoJson) {
        return annotationsGeoJson;
      }
    }
  }

  return null;
};

const CesiumAnnotationLayerButton = (props: GeoportalLayerButtonProps) => {
  const runtime = useAnnotationsRuntime();
  const { cesiumAnnotations } = geoportalAnnotationModeText.layerbar;
  return (
    <AnnotationLayerButton
      {...props}
      source={runtime}
      saveInteraction={CESIUM_ANNOTATION_SAVE_LAYERBAR_INTERACTION}
      texts={{
        focusAll: cesiumAnnotations.focusAll,
        save: cesiumAnnotations.exportAllGeoJson,
        deleteAll: cesiumAnnotations.deleteAll,
      }}
    />
  );
};

const MeasurementLayerButton = (props: GeoportalLayerButtonProps) => {
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const { actions, measurementCount, clearMeasurements } =
    useMeasurementLayerbarActions(setShowDeleteConfirmation);

  return (
    <>
      <GeoportalLayerButton
        {...props}
        actionSlot={<LayerbarActionGroup actions={actions} />}
      />
      <MeasurementDeleteConfirmationModal
        show={showDeleteConfirmation}
        count={measurementCount}
        onConfirm={() => {
          clearMeasurements();
          setShowDeleteConfirmation(false);
        }}
        onCancel={() => setShowDeleteConfirmation(false)}
      />
    </>
  );
};

const ShadowSimulationLayerButton = (props: GeoportalLayerButtonProps) => {
  const dispatch = useDispatch<AppDispatch>();
  const [shadowState, setShadowState] = useAddonState("shadowSimulation");
  const [shadowDate] = useAddonState("shadowDate");
  const selectedLayerIndex = useSelector(getSelectedLayerIndex);
  const infoViewOpen = selectedLayerIndex === props.index;

  const handleClose = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      if (shadowState) {
        setShadowState({
          ...shadowState,
          enabled: false,
          isAnimating: false,
        });
      }
      if (infoViewOpen) {
        dispatch(setSelectedLayerIndexNoSelection());
      }
      dispatch(removeLayer(props.id));
    },
    [dispatch, infoViewOpen, setShadowState, shadowState]
  );

  return (
    <GeoportalLayerButton
      {...props}
      title={props.title}
      actionSlot={
        // the texture row, or a style that launched the texture
        props.id !== SHADOW_SIMULATION_LAYER_ID ? (
          <div
            className="shrink-0 px-1"
            onClick={(event) => event.stopPropagation()}
          >
            <ShadowTextureHeaderControls compact />
          </div>
        ) : shadowState && shadowDate ? (
          <div className="flex items-center">
            <span className="mx-1.5 h-5 w-px bg-neutral-200" />
            <span className="whitespace-nowrap px-1.5 text-sm tabular-nums text-neutral-600">
              {formatShadowSelection(shadowDate)}
            </span>
            <LayerbarActionGroup
              actions={[
                {
                  id: "toggle-animation",
                  title: shadowState.isAnimating
                    ? "Animation pausieren"
                    : "Animation starten",
                  icon: (
                    <FontAwesomeIcon
                      icon={shadowState.isAnimating ? faPause : faPlay}
                      className="text-amber-600"
                    />
                  ),
                  active: shadowState.isAnimating ?? false,
                  onClick: () =>
                    setShadowState({
                      ...shadowState,
                      isAnimating: !shadowState.isAnimating,
                    }),
                },
              ]}
            />
          </div>
        ) : null
      }
      closeButton={{ icon: faTimes, onClick: handleClose }}
      closeButtonVariant="compact"
      overflowVisible
    />
  );
};

const SavedMeasurementLayerButton = (
  props: GeoportalLayerButtonProps & {
    annotationsGeoJson: AnnotationsRuntimeGeoJsonFeatureCollection;
    focusObjectLabel?: string | null;
  }
) => {
  // Registration of the external annotation collection is owned by
  // useSavedAnnotationCollectionSync (the Cesium provider and the 3D
  // measurement addon); this button only reads the registered entries.
  const { actions } = useSavedMeasurementLayerbarActions({
    layerId: props.id,
    focusObjectLabel: props.focusObjectLabel,
  });

  return (
    <GeoportalLayerButton
      {...props}
      actionSlot={
        <>
          <LayerbarActionGroup actions={actions} />
          {props.actionSlot}
        </>
      }
    />
  );
};

const GeoportalLayerButtonSlot = (props: GeoportalLayerButtonProps) => {
  const shadowTextureLauncherId = useSelector(getShadowTextureLauncherId);

  if (props.id === CESIUM_ANNOTATION_LAYER_ID) {
    return <CesiumAnnotationLayerButton {...props} />;
  }

  if (props.id === MEASUREMENT_LAYER_ID) {
    return <MeasurementLayerButton {...props} />;
  }

  if (props.id === MEASUREMENT3D_LAYER_ID) {
    return <Measurement3dLayerButton {...props} />;
  }

  if (
    props.id === SHADOW_SIMULATION_LAYER_ID ||
    props.id === SHADOW_TEXTURE_LAYER_ID
  ) {
    return <ShadowSimulationLayerButton {...props} />;
  }

  // a style that launched the shadows is their row: the same sun, date, time
  // and playback as the shadow row
  if (props.id === shadowTextureLauncherId) {
    return (
      <ShadowSimulationLayerButton
        {...props}
        layer={{ ...props.layer, icon: "shadow-simulation" }}
      />
    );
  }

  const isAdhocModelLayer =
    props.layer.type === "object" && !!props.layer.props?.style;
  const layerServiceName =
    props.layer.other?.serviceName ??
    (props.layer as { serviceName?: unknown }).serviceName;
  const isSavedMeasurementLayer = layerServiceName === MEASUREMENT_SERVICE_NAME;
  const savedMeasurementAnnotationsGeoJson =
    isSavedMeasurementLayer && isAdhocModelLayer
      ? resolveSavedMeasurementAnnotationsGeoJson(props.layer)
      : null;

  if (savedMeasurementAnnotationsGeoJson) {
    return (
      <SavedMeasurementLayerButton
        {...props}
        annotationsGeoJson={savedMeasurementAnnotationsGeoJson}
        focusObjectLabel={resolveAdhocFocusObjectLabel(props.layer)}
      />
    );
  }

  return (
    <GeoportalLayerButton
      {...props}
      actionSlot={
        <>
          {isAdhocModelLayer && (
            <AdhocModelFlyToLayerbarAction layer={props.layer} />
          )}
          <LayerAddonTriggerButtons target={props.layer} />
          {props.actionSlot}
          {isAdhocModelLayer && !isSavedMeasurementLayer && (
            <AdhocModelLayerbarActions layer={props.layer} />
          )}
        </>
      }
    />
  );
};

export default GeoportalLayerButtonSlot;
