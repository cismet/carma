import React, { useState, useEffect, useContext } from "react";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import L from "leaflet";
import "leaflet-draw";
import "leaflet-editable";
import "leaflet-measure-path";
import "./measure";
import "./measure-path";
import "leaflet-measure-path/leaflet-measure-path.css";
import makeMeasureIcon from "./measure.png";
import makeMeasureActiveIcon from "./measure-active.png";
import polygonIcon from "./polygon.png";
import polygonActiveIcon from "./polygon-active.png";
import "./m-style.css";
import { useSelector, useDispatch } from "react-redux";
import {
  getShapes,
  setShapes,
  getActiveShapes,
  setActiveShape,
  setVisibleShapes,
  getVisibleShapes,
  getDrawingShape,
  setDrawingShape,
  setShowAllMeasurements,
  getShowAllMeasurements,
  getDeleteMeasurements,
  setDeleteMeasurements,
  getMoveToShape,
  setMoveToShape,
  setUpdateShape,
  setMapMovingEnd,
  addShape,
  deleteShapeById,
  updateShapeById,
  setLastVisibleShapeActive,
  setDrawingWithLastActiveShape,
  setActiveShapeIfDrawCanseld,
  updateAreaOfDrawingMeasurement,
  deleteVisibleShapeById,
} from "../../store/slices/measurements";

import { getUIMode, toggleUIMode, UIMode } from "../../store/slices/ui";
import { getStartDrawing, setStartDrawing } from "../../store/slices/mapping";

const MapMeasurement = (props) => {
  const { routedMapRef } = useContext(TopicMapContext);

  const dispatch = useDispatch();
  const measurementShapes = useSelector(getShapes);
  const activeShape = useSelector(getActiveShapes);
  const ifDrawing = useSelector(getDrawingShape);
  const showAllMeasurements = useSelector(getShowAllMeasurements);
  const deleteShape = useSelector(getDeleteMeasurements);
  const visibleShapes = useSelector(getVisibleShapes);
  const moveToShape = useSelector(getMoveToShape);
  const mode = useSelector(getUIMode);
  const startDrawing = useSelector(getStartDrawing);
  const [measureControl, setMeasureControl] = useState(null);
  const [visiblePolylines, setVisiblePolylines] = useState();
  const [drawingShape, setDrawingLine] = useState(null);

  const toggleMeasurementModeHandler = () => {
    dispatch(toggleUIMode(UIMode.MEASUREMENT));
  };

  useEffect(() => {
    if (routedMapRef && !measureControl) {
      const mapExample = routedMapRef.leafletMap.leafletElement;
      const customOptions = {
        position: "topright",
        icon_lineActive: makeMeasureActiveIcon,
        icon_lineInactive: makeMeasureIcon,
        icon_polygonActive: polygonActiveIcon,
        icon_polygonInactive: polygonIcon,
        activeShape,
        mode_btn: `<div id='draw-shape-active' class='measure_button_wrapper'><div class='add_shape'>+</div></div>`,
        msj_disable_tool: "Do you want to disable the tool?",
        shapes: measurementShapes,
        cbSaveShape: saveShapeHandler,
        cbUpdateShape: updateShapeHandler,
        cdDeleteShape: deleteShapeHandler,
        cbDeleteVisibleShapeById: deleteVisibleShapeByIdHandler,
        cbVisiblePolylinesChange: visiblePolylinesChange,
        cbSetDrawingStatus: drawingStatusHandler,
        cbSetDrawingShape: drawingShapeHandler,
        measurementOrder: findLargestNumber(measurementShapes),
        measurementMode: mode,
        cbSetActiveShape: setActiveShapeHandler,
        cbSetUpdateStatusHandler: setUpdateStatusHandler,
        cbMapMovingEndHandler: mapMovingEndHandler,
        cbSaveLastActiveShapeIdBeforeDrawingHandler:
          saveLastActiveShapeIdBeforeDrawingHandler,
        cbChangeActiveCanceldShapeId: changeActiveCanceldShapeId,
        cbToggleMeasurementMode: toggleMeasurementModeHandler,
        cbUpdateAreaOfDrawingMeasurement: updateAreaOfDrawingMeasurementHandler,
      };

      const measurePolygonControl = L.control.measurePolygon(customOptions);
      measurePolygonControl.addTo(mapExample);
      setMeasureControl(measurePolygonControl);
    }
  }, [routedMapRef]);

  useEffect(() => {
    if (measureControl && activeShape) {
      const shapeCoordinates = measurementShapes.filter(
        (s) => s.shapeId === activeShape,
      );
      const map = routedMapRef.leafletMap.leafletElement;

      if (ifDrawing) {
        dispatch(setMoveToShape(null));
      }

      if (shapeCoordinates[0]?.shapeId && !ifDrawing && !deleteShape) {
        measureControl.changeColorByActivePolyline(
          map,
          shapeCoordinates[0].shapeId,
        );
      }
      if (showAllMeasurements) {
        const allPolylines = measureControl.getAllPolylines(map);
        measureControl.fitMapToPolylines(map, allPolylines);
        dispatch(setShowAllMeasurements(false));
      }

      if (deleteShape) {
        dispatch(setMoveToShape(null));
        measureControl.removePolylineById(map, activeShape);
        const cleanArr = visibleShapes.filter((m) => m.shapeId !== activeShape);
        deleteShapeHandler(activeShape);
        dispatch(setVisibleShapes(cleanArr));

        const cleanAllArr = measurementShapes.filter(
          (m) => m.shapeId !== activeShape,
        );
        dispatch(setShapes(cleanAllArr));
        dispatch(setDeleteMeasurements(false));
        if (measureControl.options.shapes.length === 1) {
          measureControl.options.shapes = [];
        }
        const cleanLocalLefletShapes = measureControl.options.shapes.filter(
          (m) => m.shapeId !== activeShape,
        );

        measureControl.options.shapes = cleanLocalLefletShapes;
      }
      if (moveToShape && !deleteShape) {
        measureControl.showActiveShape(map, shapeCoordinates[0]?.coordinates);
      }
    }

    if (measureControl) {
      measureControl.changeMeasurementMode(mode);
      const map = routedMapRef.leafletMap.leafletElement;
      const shapeCoordinates = measurementShapes.filter(
        (s) => s.shapeId === activeShape,
      );
      if (shapeCoordinates[0]?.shapeId) {
        measureControl.changeColorByActivePolyline(
          map,
          shapeCoordinates[0].shapeId,
        );
      }

      if (mode === "measurement" && visibleShapes.length === 0) {
        const visibleShapesIds = measureControl.getVisibleShapeIdsArr(
          measureControl._map,
        );
      }
    }
  }, [
    activeShape,
    measureControl,
    showAllMeasurements,
    deleteShape,
    ifDrawing,
    moveToShape,
    mode,
  ]);

  useEffect(() => {
    if (measureControl) {
      const cleanedVisibleArr = filterArrByIds(
        visiblePolylines,
        measurementShapes,
      );
      dispatch(setVisibleShapes(cleanedVisibleArr));

      measureControl.changeMeasurementsArr(measurementShapes);
    }
  }, [visiblePolylines, measurementShapes]);

  useEffect(() => {
    if (drawingShape) {
      const cleanArr = visibleShapes.filter((m) => m.shapeId !== 5555);
      dispatch(setVisibleShapes([...cleanArr, drawingShape]));
    } else {
      dispatch(setLastVisibleShapeActive());
    }
  }, [drawingShape]);

  useEffect(() => {
    // debugger;
    if (startDrawing && measureControl) {
      measureControl.drawingLines(routedMapRef.leafletMap.leafletElement);
    }
  }, [startDrawing]);

  const saveShapeHandler = (layer) => {
    dispatch(addShape(layer));
  };
  const deleteShapeHandler = (id) => {
    dispatch(deleteShapeById(id));
  };
  const deleteVisibleShapeByIdHandler = (id) => {
    dispatch(deleteVisibleShapeById(id));
  };
  const updateShapeHandler = (id, newCoordinates, newDistance, newSquare) => {
    dispatch(updateShapeById(id, newCoordinates, newDistance, newSquare));
  };

  const saveLastActiveShapeIdBeforeDrawingHandler = () => {
    dispatch(setDrawingWithLastActiveShape());
  };
  const changeActiveCanceldShapeId = () => {
    dispatch(setActiveShapeIfDrawCanseld());
  };

  const visiblePolylinesChange = (arr) => {
    setVisiblePolylines(arr);
  };

  const drawingStatusHandler = (status) => {
    dispatch(setDrawingShape(status));
    dispatch(setStartDrawing(status));
  };

  const drawingShapeHandler = (draw) => {
    setDrawingLine(draw);
  };
  const setActiveShapeHandler = (id) => {
    dispatch(setActiveShape(id));
    dispatch(setMoveToShape(null));
  };
  const setUpdateStatusHandler = (status) => {
    dispatch(setUpdateShape(status));
  };
  const mapMovingEndHandler = (status) => {
    dispatch(setMapMovingEnd(status));
  };




  const updateAreaOfDrawingMeasurementHandler = (newArea) => {
    dispatch(updateAreaOfDrawingMeasurement(newArea));
  };

  return <div></div>;
};

export default MapMeasurement;

function filterArrByIds(arrIds, fullArray) {
  const finalResult = [];
  fullArray.forEach((currentItem) => {
    if (arrIds.includes(currentItem.shapeId)) {
      finalResult.push(currentItem);
    }
  });

  return finalResult;
}

function findLargestNumber(measurements) {
  let largestNumber = 0;

  measurements.forEach((item) => {
    if (item.number > largestNumber) {
      largestNumber = item.number;
    }
  });

  return largestNumber;
}
