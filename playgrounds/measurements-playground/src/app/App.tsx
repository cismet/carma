import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import { suppressReactCismapErrors } from "@carma-commons/utils";
import { MapMeasurementLib } from "@carma-commons/measurements";
import { ZoomControl } from "@carma-mapping/components";
import {
  Control,
  ControlLayout,
  ControlButtonStyler,
} from "@carma-mapping/map-controls-layout";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRuler } from "@fortawesome/free-solid-svg-icons";
import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "./store";
import {
  // selectors
  getShapes,
  getActiveShapes,
  getVisibleShapes,
  getMoveToShape,
  getMode,
  getShowAll,
  getUpdateShapeToShape,
  getMapMovingEnd,
  // reducers
  setShapes,
  setActiveShape,
  setVisibleShapes,
  setDrawingShape,
  setShowAll,
  setDeleteAll,
  setMoveToShape,
  setUpdateShape,
  setMapMovingEnd,
  // thunks
  addShape,
  deleteShapeById,
  deleteVisibleShapeById,
  updateShapeById,
  setLastVisibleShapeActive,
  setDrawingWithLastActiveShape,
  setActiveShapeIfDrawCancelled,
  updateAreaOfDrawing,
  toggleMeasurementMode,
  getDrawingShape,
  getDeleteAll,
} from "./store/slices/measurements";
import { setStartDrawing as setStartDrawingAction } from "./store/slices/mapping";
import { getUIMode, UIMode } from "./store/slices/ui";

suppressReactCismapErrors();

export function App() {
  const dispatch = useDispatch<AppDispatch>();
  const [startDrawing, setStartDrawing] = useState(false);
  // selectors
  const measurementShapes = useSelector(getShapes);
  const activeShape = useSelector(getActiveShapes);
  const ifDrawing = useSelector(getDrawingShape);
  const showAllMeasurements = useSelector(getShowAll);
  const deleteShape = useSelector(getDeleteAll);
  const visibleShapes = useSelector(getVisibleShapes);
  const moveToShape = useSelector(getMoveToShape);
  const mode = useSelector(getUIMode);
  const updateShape = useSelector(getUpdateShapeToShape);
  const mapMovingEnd = useSelector(getMapMovingEnd);
  return (
    <>
      <ControlLayout ifStorybook={false}>
        <Control position="topleft" order={10}>
          <ZoomControl />
        </Control>
        <Control position="topleft" order={10}>
          <ControlButtonStyler
            onClick={() => {
              dispatch(toggleMeasurementMode());
            }}
          >
            <FontAwesomeIcon
              icon={faRuler}
              style={{ color: startDrawing ? "blue" : "black" }}
            />
          </ControlButtonStyler>
        </Control>
      </ControlLayout>
      <TopicMapComponent
        gazetteerSearchComponent={<></>}
        locatorControl={false}
        fullScreenControl={false}
        zoomControls={false}
      >
        <MapMeasurementLib
          // state
          measurementShapes={measurementShapes}
          activeShape={activeShape}
          visibleShapes={visibleShapes}
          moveToShape={moveToShape}
          mode={mode}
          ifDrawing={ifDrawing}
          showAllMeasurements={showAllMeasurements}
          deleteShape={deleteShape}
          // callbacks mapped to redux
          toggleUIMode={() => dispatch(toggleMeasurementMode() as any)}
          setShapes={(s) => dispatch(setShapes(s))}
          setActiveShape={(id) => dispatch(setActiveShape(id))}
          setVisibleShapes={(s) => dispatch(setVisibleShapes(s))}
          setDrawingShape={(b) => dispatch(setDrawingShape(b))}
          setShowAll={(b) => dispatch(setShowAll(b))}
          setDeleteAll={(b) => dispatch(setDeleteAll(b))}
          setMoveToShape={(id) => dispatch(setMoveToShape(id))}
          setUpdateShape={(b) => dispatch(setUpdateShape(b))}
          setMapMovingEnd={(b) => dispatch(setMapMovingEnd(b))}
          addShape={(l) => dispatch(addShape(l) as any)}
          deleteShapeById={(id) => dispatch(deleteShapeById(id) as any)}
          updateShapeById={(id, coords, dist, area) =>
            dispatch(updateShapeById(id, coords, dist, area) as any)
          }
          setLastVisibleShapeActive={() =>
            dispatch(setLastVisibleShapeActive() as any)
          }
          setDrawingWithLastActiveShape={() =>
            dispatch(setDrawingWithLastActiveShape() as any)
          }
          setActiveShapeIfDrawCancelled={() =>
            dispatch(setActiveShapeIfDrawCancelled() as any)
          }
          updateAreaOfDrawing={(area) =>
            dispatch(updateAreaOfDrawing(area) as any)
          }
          deleteVisibleShapeById={(id) =>
            dispatch(deleteVisibleShapeById(id) as any)
          }
          setStartDrawing={(b) => dispatch(setStartDrawingAction(b))}
        />
      </TopicMapComponent>
    </>
  );
}
