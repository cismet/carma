import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import { suppressReactCismapErrors } from "@carma-commons/utils";
import {
  MapMeasurementLib,
  InfoBoxMeasurement,
} from "@carma-commons/measurements";
import { ZoomControl } from "@carma-mapping/components";
import {
  Control,
  ControlLayout,
  ControlButtonStyler,
} from "@carma-mapping/map-controls-layout";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRuler } from "@fortawesome/free-solid-svg-icons";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch } from "./store";
import {
  // selectors
  getShapes,
  getActiveShapes,
  getVisibleShapes,
  getMoveToShape,
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
  // getDeleteAll,
  updateTitle,
} from "./store/slices/measurements";
import { setStartDrawing as setStartDrawingAction } from "./store/slices/mapping";
import { getUIMode, toggleUIMode, UIMode } from "./store/slices/ui";

suppressReactCismapErrors();

export function App() {
  const dispatch = useDispatch<AppDispatch>();
  // selectors
  // const measurementShapes = useSelector(getShapes);
  // const activeShape = useSelector(getActiveShapes);
  const ifDrawing = useSelector(getDrawingShape);
  const showAllMeasurements = useSelector(getShowAll);
  // const deleteShape = useSelector(getDeleteAll);
  const visibleShapes = useSelector(getVisibleShapes);
  // const moveToShape = useSelector(getMoveToShape);
  const mode = useSelector(getUIMode);
  const updateShape = useSelector(getUpdateShapeToShape);
  const mapMovingEnd = useSelector(getMapMovingEnd);

  const isModeMeasurement = mode === UIMode.MEASUREMENT;
  const getUrlPrefix = () => window.location.origin + window.location.pathname;

  return (
    <>
      <ControlLayout ifStorybook={false}>
        <Control position="topleft" order={10}>
          <ZoomControl />
        </Control>
        <Control position="topleft" order={10}>
          <ControlButtonStyler
            onClick={() => {
              if (!isModeMeasurement) {
                dispatch(setDrawingShape(false));
              }
              dispatch(toggleUIMode(UIMode.MEASUREMENT));
            }}
          >
            <img
              src={`${getUrlPrefix()}${
                isModeMeasurement ? "measure-active.png" : "measure.png"
              }`}
              alt="Measure"
              className="w-6"
            />
          </ControlButtonStyler>
        </Control>
        {isModeMeasurement && (
          <InfoBoxMeasurement
          // measurementsData={measurementShapes}
          // visibleShapesData={visibleShapes}
          // // activeShape={activeShape}
          // moveToShape={moveToShape}
          // updateShape={updateShape}
          // drawingMode={ifDrawing}
          // mapMovingEnd={mapMovingEnd}
          // setMoveToShape={(id) => dispatch(setMoveToShape(id))}
          // // setActiveShape={(id) => dispatch(setActiveShape(id))}
          // setUpdateShape={(s) => dispatch(setUpdateShape(s))}
          // setDeleteAll={() => dispatch(setDeleteAll(true))}
          // setMapMovingEnd={() => dispatch(setMapMovingEnd(false))}
          // setShowAll={() => dispatch(setShowAll(true))}
          // updateTitle={(shapeId, customTitle) =>
          //   dispatch(updateTitle(shapeId, customTitle))
          // }
          />
        )}
      </ControlLayout>
      <TopicMapComponent
        gazetteerSearchComponent={<></>}
        locatorControl={false}
        fullScreenControl={false}
        zoomControls={false}
        leafletMapProps={{ editable: true }}
      >
        <MapMeasurementLib
          // state
          // measurementShapes={measurementShapes}
          // activeShape={activeShape}
          // visibleShapes={visibleShapes}
          // moveToShape={moveToShape}
          mode={mode}
          // ifDrawing={ifDrawing}
          // showAllMeasurements={showAllMeasurements}
          // deleteShape={deleteShape}
          // callbacks mapped to redux
          // toggleUIMode={() => dispatch(toggleMeasurementMode() as any)}
          // setShapes={(s) => dispatch(setShapes(s))}
          // setActiveShape={(id) => dispatch(setActiveShape(id))}
          // setVisibleShapes={(s) => dispatch(setVisibleShapes(s))}
          // setDrawingShape={(b) => dispatch(setDrawingShape(b))}
          // setShowAll={(b) => dispatch(setShowAll(b))}
          // setDeleteAll={(b) => dispatch(setDeleteAll(b))}
          // setMoveToShape={(id) => dispatch(setMoveToShape(id))}
          // setUpdateShape={(b) => dispatch(setUpdateShape(b))}
          // setMapMovingEnd={(b) => dispatch(setMapMovingEnd(b))}
          // addShape={(layer) => dispatch(addShape(layer) as any)}
          // deleteShapeById={(id) => dispatch(deleteShapeById(id) as any)}
          // updateShapeById={(id, coords, dist, area) =>
          //   dispatch(updateShapeById(id, coords, dist, area) as any)
          // }
          // setLastVisibleShapeActive={() =>
          //   dispatch(setLastVisibleShapeActive() as any)
          // }
          // setDrawingWithLastActiveShape={() =>
          //   dispatch(setDrawingWithLastActiveShape() as any)
          // }
          // setActiveShapeIfDrawCancelled={() =>
          //   dispatch(setActiveShapeIfDrawCancelled() as any)
          // }
          // updateAreaOfDrawing={(area) =>
          //   dispatch(updateAreaOfDrawing(area) as any)
          // }
          // deleteVisibleShapeById={(id) =>
          //   dispatch(deleteVisibleShapeById(id) as any)
          // }
          // setStartDrawing={(b) => dispatch(setStartDrawingAction(b))}
        />
      </TopicMapComponent>
    </>
  );
}
