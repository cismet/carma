import React, { useState, useEffect, useContext } from "react";
import { useDispatch, useSelector } from "react-redux";
import L from "leaflet";
import "leaflet-draw";
import "leaflet-editable";

import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

import type { AppDispatch } from "../../store";
import {
  addShape,
  deleteShapeById,
  deleteVisibleShapeById,
  getActiveShapes,
  getDeleteAll,
  getDrawingShape,
  getMoveToShape,
  getShowAll,
  getShapes,
  getVisibleShapes,
  setActiveShape,
  setActiveShapeIfDrawCancelled,
  setDeleteAll,
  setDrawingShape,
  setDrawingWithLastActiveShape,
  setLastVisibleShapeActive,
  setMapMovingEnd,
  setMoveToShape,
  setShapes,
  setShowAll,
  setUpdateShape,
  setVisibleShapes,
  updateAreaOfDrawing,
  updateShapeById,
} from "../../store/slices/measurements";

import { toggleUIMode, UIMode, getUIMode } from "../../store/slices/ui";
import {
  setStartDrawing,
  getStartDrawing,
} from "../../store/slices/mapping";
import useDeviceDetection from "../../hooks/useDeviceDetection";
import useMeasureControl from "./hooks/useMeasureControl";

import { filterArrByIds } from "./utils";
import "./measure";
import "./measure-path";

import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import "leaflet-measure-path/leaflet-measure-path.css";
import "./m-style.css";

const MapMeasurement = (props) => {
  const { routedMapRef } = useContext(TopicMapContext) as {
    routedMapRef: { leafletMap: { leafletElement: L.Map } };
  };

  const dispatch: AppDispatch = useDispatch();
  const measurementShapes = useSelector(getShapes);
  const activeShape = useSelector(getActiveShapes);
  const ifDrawing = useSelector(getDrawingShape);
  const showAllMeasurements = useSelector(getShowAll);
  const deleteShape = useSelector(getDeleteAll);
  const visibleShapes = useSelector(getVisibleShapes);
  const moveToShape = useSelector(getMoveToShape);
  const uiMode = useSelector(getUIMode);
  const startDrawing = useSelector(getStartDrawing);
  const [visiblePolylines, setVisiblePolylines] = useState([]);
  const [drawingShape, setDrawingLine] = useState(null);

  const device = useDeviceDetection();

  const toggleMeasurementModeHandler = () => {
    dispatch(toggleUIMode(UIMode.MEASUREMENT));
  };

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
    dispatch(setActiveShapeIfDrawCancelled());
  };

  const drawingStatusHandler = (status) => {
    dispatch(setDrawingShape(status));
    dispatch(setStartDrawing(status));
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
    dispatch(updateAreaOfDrawing(newArea));
  };

  const handlers = {
    cbSaveShape: saveShapeHandler,
    cbUpdateShape: updateShapeHandler,
    cdDeleteShape: deleteShapeHandler,
    cbDeleteVisibleShapeById: deleteVisibleShapeByIdHandler,
    cbVisiblePolylinesChange: setVisiblePolylines,
    cbSetDrawingStatus: drawingStatusHandler,
    cbSetDrawingShape: setDrawingLine,
    cbSetActiveShape: setActiveShapeHandler,
    cbSetUpdateStatusHandler: setUpdateStatusHandler,
    cbMapMovingEndHandler: mapMovingEndHandler,
    cbSaveLastActiveShapeIdBeforeDrawingHandler:
      saveLastActiveShapeIdBeforeDrawingHandler,
    cbChangeActiveCanceldShapeId: changeActiveCanceldShapeId,
    cbToggleMeasurementMode: toggleMeasurementModeHandler,
    cbUpdateAreaOfDrawingMeasurement: updateAreaOfDrawingMeasurementHandler,
  };

  const measureControl = useMeasureControl({
    routedMapRef,
    measurementShapes,
    activeShape,
    device,
    mode: uiMode,
    handlers,
  });

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
        dispatch(setShowAll(false));
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
        dispatch(setDeleteAll(false));
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
      const map = routedMapRef.leafletMap.leafletElement;
      measureControl.changeMeasurementMode(uiMode, map);
      const shapeCoordinates = measurementShapes.filter(
        (s) => s.shapeId === activeShape,
      );
      if (shapeCoordinates[0]?.shapeId) {
        measureControl.changeColorByActivePolyline(
          map,
          shapeCoordinates[0].shapeId,
        );
      }

      if (uiMode === "measurement" && visibleShapes.length === 0) {
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
    uiMode,
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

  // useEffect(() => {
  //   if (startDrawing && measureControl) {
  //     measureControl.drawingLines(routedMapRef.leafletMap.leafletElement);
  //   }
  // }, [startDrawing]);

  console.info("RENDER: MapMeasurement");
  return <div></div>;
};

export default MapMeasurement;
