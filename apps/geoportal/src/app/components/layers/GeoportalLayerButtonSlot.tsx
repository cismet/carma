import {
  useCallback,
  useMemo,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { useDispatch, useSelector } from "react-redux";

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
  flyToAnnotationIds,
  selectAuthoringAnnotationEntries,
  type AnnotationsRuntimeGeoJsonFeatureCollection,
  useAnnotationsRuntime,
} from "@carma-mapping/annotations/runtime";
import { useMeasurements } from "@carma-mapping/measurements";
import { useAddonState } from "@carma-mapping/addons";
import { useLibreMapEnabled } from "../../hooks/useLibreMapEnabled";

import { geoportalAnnotationModeText } from "../../config/geoportalTextConfig";

import {
  getActiveInteractionButtonID,
  getActiveInteractionLayerID,
  removeLayer,
  setActiveInteractionButtonID,
  setActiveInteractionLayerID,
} from "../../store/slices/mapping";
import type { AppDispatch } from "../../store";
import {
  CESIUM_ANNOTATION_LAYER_ID,
  CESIUM_ANNOTATION_SAVE_INTERACTION_ID,
} from "../annotations/cesium-annotations.constants";
import { MeasurementDeleteConfirmationModal } from "../annotations/MeasurementDeleteConfirmationModal";
import { MEASUREMENT_LAYER_ID } from "../../hooks/useMeasurementLayerButton";
import {
  formatShadowSelection,
  SHADOW_SIMULATION_LAYER_ID,
} from "../../hooks/useShadowSimulationLayerButton";
import {
  AdhocModelFlyToLayerbarAction,
  AdhocModelLayerbarActions,
} from "./AdhocModelLayerbarControls";
import GeoportalLayerButton, {
  type GeoportalLayerButtonProps,
} from "./GeoportalLayerButton";
import { getGeoportalLayerToolActionButtonClassName } from "./layer-tool-action-button-style";
import { LayerAddonTriggerButtons } from "./LayerAddonTriggerButtons";
import {
  normalizeAnnotationsRuntimeGeoJsonFeatureCollection,
  parseStyleObject,
  resolveAdhocFocusObjectLabel,
} from "./measurement-import-utils";

const MEASUREMENT_SERVICE_NAME = "measurements";

type LayerbarInteractionTarget = Readonly<{
  layerId: string;
  buttonId: string;
}>;

type LayerbarAction = Readonly<{
  id: string;
  title: string;
  icon: ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
}>;

const CESIUM_ANNOTATION_SAVE_LAYERBAR_INTERACTION = {
  layerId: CESIUM_ANNOTATION_LAYER_ID,
  buttonId: CESIUM_ANNOTATION_SAVE_INTERACTION_ID,
} as const satisfies LayerbarInteractionTarget;

const isLayerbarInteractionActive = (
  activeInteractionLayerID: string | null,
  activeInteractionButtonID: string | null,
  target: LayerbarInteractionTarget
) =>
  activeInteractionLayerID === target.layerId &&
  activeInteractionButtonID === target.buttonId;

const setLayerbarInteractionActive = (
  dispatch: AppDispatch,
  target: LayerbarInteractionTarget,
  active: boolean
) => {
  dispatch(setActiveInteractionLayerID(active ? target.layerId : null));
  dispatch(setActiveInteractionButtonID(active ? target.buttonId : null));
};

const useLayerbarInteractionToggle = (target: LayerbarInteractionTarget) => {
  const dispatch = useDispatch<AppDispatch>();
  const activeInteractionLayerID = useSelector(getActiveInteractionLayerID);
  const activeInteractionButtonID = useSelector(getActiveInteractionButtonID);
  const active = isLayerbarInteractionActive(
    activeInteractionLayerID,
    activeInteractionButtonID,
    target
  );
  const onToggle = useCallback(() => {
    setLayerbarInteractionActive(dispatch, target, !active);
  }, [active, dispatch, target]);

  return { active, onToggle };
};

const useCesiumAnnotationLayerbarActions = (layerId: string) => {
  const dispatch = useDispatch<AppDispatch>();
  const saveInteraction = useLayerbarInteractionToggle(
    CESIUM_ANNOTATION_SAVE_LAYERBAR_INTERACTION
  );
  const { layerbar } = geoportalAnnotationModeText;
  const { annotationEntries, nodes, removeAnnotationsByIds, scene } =
    useAnnotationsRuntime();
  const authoringAnnotationEntries = selectAuthoringAnnotationEntries({
    annotationEntries,
  });
  const authoringAnnotationIds = authoringAnnotationEntries.map(
    (annotationEntry) => annotationEntry.id
  );
  const hasAuthoringAnnotations = authoringAnnotationEntries.length > 0;

  const handleClose = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      dispatch(removeLayer(layerId));
    },
    [dispatch, layerId]
  );

  const actions: LayerbarAction[] = [
    {
      id: "focus-all",
      title: layerbar.cesiumAnnotations.focusAll,
      icon: <Icon name="search-location" className="leading-none" />,
      disabled: !hasAuthoringAnnotations,
      onClick: () => {
        flyToAnnotationIds({
          annotationEntries,
          annotationIds: authoringAnnotationIds,
          nodes,
          scene,
        });
      },
    },
    {
      id: "save",
      title: layerbar.cesiumAnnotations.exportAllGeoJson,
      icon: <FontAwesomeIcon icon={faFloppyDisk} />,
      active: saveInteraction.active,
      disabled: !hasAuthoringAnnotations,
      onClick: saveInteraction.onToggle,
    },
    {
      id: "delete-all",
      title: layerbar.cesiumAnnotations.deleteAll,
      icon: <FontAwesomeIcon icon={faTrashCan} />,
      disabled: !hasAuthoringAnnotations,
      onClick: (event) => {
        removeAnnotationsByIds(authoringAnnotationIds, {
          skipConfirmation: event.shiftKey,
          source: ANNOTATION_DELETE_CONFIRMATION_SOURCES.UI,
        });
      },
    },
  ];

  return { actions, handleClose };
};

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

const useSavedCesiumMeasurementLayerbarActions = ({
  layerId,
  focusObjectLabel,
}: {
  layerId: string;
  focusObjectLabel?: string | null;
}) => {
  const { annotationEntries, nodes, scene, setSelectedAnnotationId } =
    useAnnotationsRuntime();
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
      scene,
    });
  }, [
    annotationEntries,
    nodes,
    savedAnnotationIds,
    scene,
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

const LayerButtonActionButton = ({
  title,
  icon,
  active = false,
  disabled = false,
  onClick,
}: LayerbarAction) => (
  <Tooltip title={title} placement="top">
    <button
      type="button"
      className={getGeoportalLayerToolActionButtonClassName(
        active,
        "disabled:text-gray-400"
      )}
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

const LayerbarActionGroup = ({ actions }: { actions: LayerbarAction[] }) => (
  <div className="flex items-center">
    {actions.map((action) => (
      <LayerButtonActionButton key={action.id} {...action} />
    ))}
  </div>
);

const CesiumAnnotationLayerButton = (props: GeoportalLayerButtonProps) => {
  const { actions, handleClose } = useCesiumAnnotationLayerbarActions(props.id);
  return (
    <GeoportalLayerButton
      {...props}
      actionSlot={<LayerbarActionGroup actions={actions} />}
      closeButton={{ icon: faTimes, onClick: handleClose }}
      closeButtonVariant="compact"
      interactionActivationMode="button"
      overflowVisible
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

  const handleClose = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      if (shadowState) {
        setShadowState({ ...shadowState, enabled: false });
      }
      dispatch(removeLayer(SHADOW_SIMULATION_LAYER_ID));
    },
    [dispatch, setShadowState, shadowState]
  );

  return (
    <GeoportalLayerButton
      {...props}
      title={
        shadowState
          ? `${props.title} · ${formatShadowSelection(shadowState.selection)}`
          : props.title
      }
      closeButton={{ icon: faTimes, onClick: handleClose }}
    />
  );
};

const SavedCesiumMeasurementLayerButton = (
  props: GeoportalLayerButtonProps & {
    annotationsGeoJson: AnnotationsRuntimeGeoJsonFeatureCollection;
    focusObjectLabel?: string | null;
  }
) => {
  // Registration of the external annotation collection is owned by
  // SavedAnnotationCollectionSync in the annotation
  // provider; this button only reads the registered entries for fly-to.
  const { actions } = useSavedCesiumMeasurementLayerbarActions({
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
  if (props.id === CESIUM_ANNOTATION_LAYER_ID) {
    return <CesiumAnnotationLayerButton {...props} />;
  }

  if (props.id === MEASUREMENT_LAYER_ID) {
    return <MeasurementLayerButton {...props} />;
  }

  if (props.id === SHADOW_SIMULATION_LAYER_ID) {
    return <ShadowSimulationLayerButton {...props} />;
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
