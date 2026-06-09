import {
  useCallback,
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
  useAnnotationsRuntime,
} from "@carma-mapping/annotations/runtime";

import { geoportalAnnotationModeText } from "../../config/geoportalTextConfig";

import { removeLayer } from "../../store/slices/mapping";
import { CESIUM_ANNOTATION_LAYER_ID } from "../annotations/cesium-annotations.constants";
import { MEASUREMENT_LAYER_ID } from "../../hooks/useMeasurementLayerButton";
import {
  AdhocModelFlyToLayerbarAction,
  AdhocModelLayerbarActions,
} from "./AdhocModelLayerbarControls";
import GeoportalLayerButton, {
  type GeoportalLayerButtonProps,
} from "./GeoportalLayerButton";

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
  const {
    annotationEntries,
    exportAllAnnotationsGeoJson,
    flyToAllAnnotations,
    removeAnnotationsByIds,
  } = useAnnotationsRuntime();
  const hasAnnotations = annotationEntries.length > 0;
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
            onClick={flyToAllAnnotations}
          />
          <LayerButtonActionButton
            title={layerbar.cesiumAnnotations.exportAllGeoJson}
            icon={<FontAwesomeIcon icon={faFloppyDisk} />}
            disabled={!hasAnnotations}
            onClick={exportAllAnnotationsGeoJson}
          />
          <LayerButtonActionButton
            title={layerbar.cesiumAnnotations.deleteAll}
            icon={<FontAwesomeIcon icon={faTrashCan} />}
            disabled={!hasAnnotations}
            onClick={(event) => {
              removeAnnotationsByIds(
                annotationEntries.map((annotationEntry) => annotationEntry.id),
                {
                  skipConfirmation: event.shiftKey,
                  source: ANNOTATION_DELETE_CONFIRMATION_SOURCES.UI,
                }
              );
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

  return (
    <GeoportalLayerButton
      {...props}
      actionSlot={
        <div className="flex items-center">
          <LayerButtonActionButton
            title={layerbar.leafletMeasurements.deleteAll}
            icon={<FontAwesomeIcon icon={faTrashCan} />}
            disabled={shapes.length === 0}
            onClick={clearAllShapes}
          />
        </div>
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

  return (
    <GeoportalLayerButton
      {...props}
      actionSlot={
        <>
          {isAdhocModelLayer && (
            <AdhocModelFlyToLayerbarAction layer={props.layer} />
          )}
          {props.actionSlot}
          {isAdhocModelLayer && (
            <AdhocModelLayerbarActions layer={props.layer} />
          )}
        </>
      }
    />
  );
};

export default GeoportalLayerButtonSlot;
