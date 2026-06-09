import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { useDispatch } from "react-redux";

import {
  faFloppyDisk,
  faTimes,
  faTrashCan,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Tooltip } from "antd";
import Icon from "react-cismap/commons/Icon";

import { useMapMeasurementsContext } from "@carma-commons/measurements";
import {
  ANNOTATION_DELETE_CONFIRMATION_SOURCES,
  ANNOTATIONS_RUNTIME_GEOJSON_FORMAT_ID,
  ANNOTATIONS_RUNTIME_GEOJSON_FORMAT_VERSION,
  flyToAnnotationIds,
  resolveAnnotationsRuntimePersistenceFromGeoJson,
  type AnnotationsRuntimeGeoJsonFeatureCollection,
  useAnnotationsRuntime,
} from "@carma-mapping/annotations/runtime";

import { geoportalAnnotationModeText } from "../../config/geoportalTextConfig";

import {
  removeLayer,
  setActiveInteractionButtonID,
  setActiveInteractionLayerID,
} from "../../store/slices/mapping";
import {
  CESIUM_ANNOTATION_LAYER_ID,
  CESIUM_ANNOTATION_SAVE_INTERACTION_ID,
} from "../annotations/cesium-annotations.constants";
import { MeasurementDeleteConfirmationModal } from "../annotations/MeasurementDeleteConfirmationModal";
import { MEASUREMENT_LAYER_ID } from "../../hooks/useMeasurementLayerButton";
import {
  AdhocModelFlyToLayerbarAction,
  AdhocModelLayerbarActions,
} from "./AdhocModelLayerbarControls";
import GeoportalLayerButton, {
  type GeoportalLayerButtonProps,
} from "./GeoportalLayerButton";

const MEASUREMENT_SERVICE_NAME = "measurements";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const parseStyleObject = (style: unknown): Record<string, unknown> | null => {
  if (isRecord(style)) {
    return style;
  }
  if (typeof style !== "string") {
    return null;
  }
  try {
    const parsed = JSON.parse(style);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const normalizeAnnotationsRuntimeGeoJsonFeatureCollection = (
  value: unknown
): AnnotationsRuntimeGeoJsonFeatureCollection | null => {
  const candidate = value as AnnotationsRuntimeGeoJsonFeatureCollection;
  const persistenceState =
    resolveAnnotationsRuntimePersistenceFromGeoJson(value);

  if (!persistenceState) {
    return null;
  }

  if (
    candidate?.type === "FeatureCollection" &&
    Array.isArray(candidate.features) &&
    candidate.metadata?.carmaConf?.formatId ===
      ANNOTATIONS_RUNTIME_GEOJSON_FORMAT_ID &&
    candidate.metadata.carmaConf.annotationsRuntimePersistence?.formatId ===
      "annotations-runtime-persistence"
  ) {
    return candidate;
  }

  return {
    ...candidate,
    type: "FeatureCollection",
    features: candidate.features,
    metadata: {
      carmaConf: {
        formatId: ANNOTATIONS_RUNTIME_GEOJSON_FORMAT_ID,
        formatVersion: ANNOTATIONS_RUNTIME_GEOJSON_FORMAT_VERSION,
        source: "geoportal-cesium-annotations",
        annotationsRuntimePersistence: persistenceState,
      },
    },
  };
};

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

type LayerButtonActionButtonProps = {
  title: string;
  icon: ReactNode;
  disabled?: boolean;
  onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
};

const LayerButtonActionButton = ({
  title,
  icon,
  disabled = false,
  onClick,
}: LayerButtonActionButtonProps) => (
  <Tooltip title={title} placement="top">
    <button
      type="button"
      className="px-1.5 flex items-center justify-center text-sm text-gray-600 hover:text-gray-500 disabled:text-gray-400"
      onClick={(event) => {
        event.stopPropagation();
        onClick(event);
      }}
      disabled={disabled}
      aria-label={title}
    >
      {icon}
    </button>
  </Tooltip>
);

const CesiumAnnotationLayerButton = (props: GeoportalLayerButtonProps) => {
  const dispatch = useDispatch();
  const { layerbar } = geoportalAnnotationModeText;
  const { annotationEntries, nodes, removeAnnotationsByIds, scene } =
    useAnnotationsRuntime();
  const liveAnnotationEntries = annotationEntries.filter(
    (annotationEntry) => !annotationEntry.readOnlySource
  );
  const liveAnnotationIds = liveAnnotationEntries.map(
    (annotationEntry) => annotationEntry.id
  );
  const hasAnnotations = liveAnnotationEntries.length > 0;
  const handleClose = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      dispatch(removeLayer(props.id));
    },
    [dispatch, props.id]
  );

  return (
    <GeoportalLayerButton
      {...props}
      actionSlot={
        <div className="flex items-center">
          <LayerButtonActionButton
            title={layerbar.cesiumAnnotations.focusAll}
            icon={<Icon name="search-location" className="leading-none" />}
            disabled={!hasAnnotations}
            onClick={() => {
              flyToAnnotationIds({
                annotationEntries,
                annotationIds: liveAnnotationIds,
                nodes,
                scene,
              });
            }}
          />
          <LayerButtonActionButton
            title={layerbar.cesiumAnnotations.exportAllGeoJson}
            icon={<FontAwesomeIcon icon={faFloppyDisk} />}
            disabled={!hasAnnotations}
            onClick={() => {
              dispatch(setActiveInteractionLayerID(CESIUM_ANNOTATION_LAYER_ID));
              dispatch(
                setActiveInteractionButtonID(
                  CESIUM_ANNOTATION_SAVE_INTERACTION_ID
                )
              );
            }}
          />
          <LayerButtonActionButton
            title={layerbar.cesiumAnnotations.deleteAll}
            icon={<FontAwesomeIcon icon={faTrashCan} />}
            disabled={!hasAnnotations}
            onClick={(event) => {
              removeAnnotationsByIds(liveAnnotationIds, {
                skipConfirmation: event.shiftKey,
                source: ANNOTATION_DELETE_CONFIRMATION_SOURCES.UI,
              });
            }}
          />
        </div>
      }
      closeButton={{ icon: faTimes, onClick: handleClose }}
      closeButtonVariant="compact"
      interactionActivationMode="button"
      overflowVisible
    />
  );
};

const MeasurementLayerButton = (props: GeoportalLayerButtonProps) => {
  const { layerbar } = geoportalAnnotationModeText;
  const { shapes, clearAllShapes } = useMapMeasurementsContext();
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);

  return (
    <>
      <GeoportalLayerButton
        {...props}
        actionSlot={
          <div className="flex items-center">
            <LayerButtonActionButton
              title={layerbar.leafletMeasurements.deleteAll}
              icon={<FontAwesomeIcon icon={faTrashCan} />}
              disabled={shapes.length === 0}
              onClick={(event) => {
                if (event.shiftKey) {
                  clearAllShapes();
                  return;
                }
                setShowDeleteConfirmation(true);
              }}
            />
          </div>
        }
      />
      <MeasurementDeleteConfirmationModal
        show={showDeleteConfirmation}
        count={shapes.length}
        onConfirm={() => {
          clearAllShapes();
          setShowDeleteConfirmation(false);
        }}
        onCancel={() => setShowDeleteConfirmation(false)}
      />
    </>
  );
};

const SavedCesiumMeasurementLayerButton = (
  props: GeoportalLayerButtonProps & {
    annotationsGeoJson: AnnotationsRuntimeGeoJsonFeatureCollection;
  }
) => {
  const {
    annotationEntries,
    appendAnnotationsRuntimePersistenceState,
    nodes,
    removeReadOnlyAnnotationsBySource,
    scene,
  } = useAnnotationsRuntime();
  const {
    layerbar: { adhocModel },
  } = geoportalAnnotationModeText;
  const readOnlySource = useMemo(
    () => ({
      type: "saved-measurement" as const,
      id: props.id,
    }),
    [props.id]
  );

  useEffect(() => {
    appendAnnotationsRuntimePersistenceState(
      props.annotationsGeoJson.metadata.carmaConf.annotationsRuntimePersistence,
      {
        idPrefix: props.id,
        locked: true,
        readOnlySource,
        selectAnnotationId: null,
        skipExisting: true,
      }
    );

    return () => {
      removeReadOnlyAnnotationsBySource(readOnlySource);
    };
  }, [
    appendAnnotationsRuntimePersistenceState,
    props.annotationsGeoJson,
    props.id,
    readOnlySource,
    removeReadOnlyAnnotationsBySource,
  ]);

  const savedAnnotationIds = useMemo(
    () =>
      annotationEntries
        .filter(
          (annotationEntry) =>
            annotationEntry.readOnlySource?.type === readOnlySource.type &&
            annotationEntry.readOnlySource.id === readOnlySource.id
        )
        .map((annotationEntry) => annotationEntry.id),
    [annotationEntries, readOnlySource]
  );

  const handleFlyTo = useCallback(() => {
    flyToAnnotationIds({
      annotationEntries,
      annotationIds: savedAnnotationIds,
      nodes,
      scene,
    });
  }, [annotationEntries, nodes, savedAnnotationIds, scene]);

  return (
    <GeoportalLayerButton
      {...props}
      actionSlot={
        <>
          <LayerButtonActionButton
            title={adhocModel.actions.focusObject}
            icon={<Icon name="search-location" className="leading-none" />}
            disabled={savedAnnotationIds.length === 0}
            onClick={handleFlyTo}
          />
          {props.actionSlot}
        </>
      }
    />
  );
};

const GeoportalLayerButtonSlot = (props: GeoportalLayerButtonProps) => {
  if (props.id === CESIUM_ANNOTATION_LAYER_ID) {
    return <CesiumAnnotationLayerButton {...props} />;
  }

  if (props.id === MEASUREMENT_LAYER_ID) {
    return <MeasurementLayerButton {...props} />;
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
      <SavedCesiumMeasurementLayerButton
        {...props}
        annotationsGeoJson={savedMeasurementAnnotationsGeoJson}
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
