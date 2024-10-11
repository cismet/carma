import React, { useState, useEffect, useContext } from "react";
import type { UnknownAction } from "redux";
import { useDispatch } from "react-redux";
import L from "leaflet";
import "leaflet-draw";
import "leaflet-editable";

import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

import {
  setShapes,
  setActiveShape,
  setVisibleShapes,
  setDrawingShape,
  setShowAllMeasurements,
  setDeleteMeasurements,
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
  useMeasurementShapes,
  useMeasurementActiveShapes,
  useMeasurementDrawingShape,
  useMeasurementShowAllMeasurements,
  useMeasurementDeleteMeasurements,
  useMeasurementVisibleShapes,
  useMeasurementMoveToShape,
} from "../../store/slices/measurements";

import { toggleUIMode, UIMode, useUIMode } from "../../store/slices/ui";
import { setStartDrawing, useMappingStartDrawing } from "../../store/slices/mapping";
import useDeviceDetection from "../../hooks/useDeviceDetection";
import { filterArrByIds } from "./utils";
import "./measure";
import "./measure-path";

import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import "leaflet-measure-path/leaflet-measure-path.css";
import "./m-style.css";
import useMeasureControl from "./hooks/useMeasureControl";

const MapMeasurement = (props) => {
  const { routedMapRef } = useContext(TopicMapContext) as { routedMapRef: { leafletMap: { leafletElement: L.Map } } };

  const dispatch = useDispatch();
  const measurementShapes = useMeasurementShapes();
  const activeShape = useMeasurementActiveShapes();
  const ifDrawing = useMeasurementDrawingShape();
  const showAllMeasurements = useMeasurementShowAllMeasurements();
  const deleteShape = useMeasurementDeleteMeasurements();
  const visibleShapes = useMeasurementVisibleShapes();
  const moveToShape = useMeasurementMoveToShape();
  const mode = useUIMode();
  const startDrawing = useMappingStartDrawing();
  const [visiblePolylines, setVisiblePolylines] = useState();
  const [drawingShape, setDrawingLine] = useState(null);

  const device = useDeviceDetection();

  const toggleMeasurementModeHandler = () => {
    dispatch(toggleUIMode(UIMode.MEASUREMENT));
  };

  const saveShapeHandler = (layer) => {
    dispatch(addShape(layer) as unknown as UnknownAction);
  };
  const deleteShapeHandler = (id) => {
    dispatch(deleteShapeById(id) as unknown as UnknownAction);
  };
  const deleteVisibleShapeByIdHandler = (id) => {
    dispatch(deleteVisibleShapeById(id) as unknown as UnknownAction);
  };
  const updateShapeHandler = (id, newCoordinates, newDistance, newSquare) => {
    dispatch(updateShapeById(id, newCoordinates, newDistance, newSquare) as unknown as UnknownAction);
  };

  const saveLastActiveShapeIdBeforeDrawingHandler = () => {
    dispatch(setDrawingWithLastActiveShape() as unknown as UnknownAction);
  };
  const changeActiveCanceldShapeId = () => {
    dispatch(setActiveShapeIfDrawCanseld() as unknown as UnknownAction);
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
    dispatch(updateAreaOfDrawingMeasurement(newArea) as unknown as UnknownAction);
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
    cbSaveLastActiveShapeIdBeforeDrawingHandler: saveLastActiveShapeIdBeforeDrawingHandler,
    cbChangeActiveCanceldShapeId: changeActiveCanceldShapeId,
    cbToggleMeasurementMode: toggleMeasurementModeHandler,
    cbUpdateAreaOfDrawingMeasurement: updateAreaOfDrawingMeasurementHandler,
  };

  const measureControl = useMeasureControl({
    routedMapRef,
    measurementShapes,
    activeShape,
    device,
    mode,
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
      const map = routedMapRef.leafletMap.leafletElement;
      measureControl.changeMeasurementMode(mode, map);
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
      dispatch(setLastVisibleShapeActive() as unknown as UnknownAction);
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