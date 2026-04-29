import {
  useCallback,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { useDispatch } from "react-redux";

import { faTimes, faTrashCan } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Tooltip } from "antd";
import Icon from "react-cismap/commons/Icon";

import { useMapMeasurementsContext } from "@carma-commons/measurements";
import { useAnnotationsRuntime } from "@carma-mapping/annotations/runtime";

import { removeLayer } from "../../store/slices/mapping";
import { CESIUM_ANNOTATION_LAYER_ID } from "../annotations/cesium-annotations.constants";
import { MEASUREMENT_LAYER_ID } from "../../hooks/useMeasurementLayerButton";
import GeoportalLayerButton, {
  type GeoportalLayerButtonProps,
} from "./GeoportalLayerButton";

type LayerButtonActionButtonProps = {
  title: string;
  icon: ReactNode;
  disabled?: boolean;
  onClick: () => void;
};

const LayerButtonActionButton = ({
  title,
  icon,
  disabled = false,
  onClick,
}: LayerButtonActionButtonProps) => (
  <Tooltip title={title} placement="top">
    <button
      className="flex h-8 w-7 min-w-7 items-center justify-center text-gray-600 hover:text-gray-500 disabled:text-gray-400"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
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
  const {
    annotationEntries,
    flyToAllAnnotations,
    removeAnnotationById,
    setElevationReferenceAnnotationId,
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
        <div className="flex items-center gap-1.5">
          <LayerButtonActionButton
            title="Alle Messungen fokussieren"
            icon={
              <Icon
                name="search-location"
                className="text-[16px] leading-none"
              />
            }
            disabled={!hasAnnotations}
            onClick={flyToAllAnnotations}
          />
          <LayerButtonActionButton
            title="Alle Messungen löschen"
            icon={
              <FontAwesomeIcon
                icon={faTrashCan}
                className="text-[16px] leading-none"
              />
            }
            disabled={!hasAnnotations}
            onClick={() => {
              setElevationReferenceAnnotationId(null);
              annotationEntries.forEach((annotationEntry) => {
                removeAnnotationById(annotationEntry.id);
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
  const { shapes, clearAllShapes } = useMapMeasurementsContext();

  return (
    <GeoportalLayerButton
      {...props}
      actionSlot={
        <div className="flex items-center gap-1.5">
          <LayerButtonActionButton
            title="Alle Messungen löschen"
            icon={
              <FontAwesomeIcon
                icon={faTrashCan}
                className="text-[16px] leading-none"
              />
            }
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

  return <GeoportalLayerButton {...props} />;
};

export default GeoportalLayerButtonSlot;
