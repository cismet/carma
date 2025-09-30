import React, { useState, useEffect, useContext } from "react";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import L from "leaflet";
import "leaflet-draw";
import "leaflet-editable";
import "./utils/measure";
import "./utils/measure-path";
import "leaflet-measure-path/leaflet-measure-path.css";
import makeMeasureIcon from "./assets/measure.png";
import makeMeasureActiveIcon from "./assets/measure-active.png";
import "./styles/m-style.css";
import useDeviceDetection from "./hooks/useDeviceDetection";

export interface MeasurementShape {
  shapeId: number | string;
  number: number;
  coordinates?: any;
  [key: string]: any;
}

export type UIModeType = string | "measurement" | "default" | any;
export interface MapMeasurementProps {
  measurementShapes: MeasurementShape[];
  activeShape?: number | string | null;
  ifDrawing?: boolean;
  showAllMeasurements?: boolean;
  deleteShape?: boolean;
  visibleShapes: MeasurementShape[];
  moveToShape?: number | string | null;
  mode?: UIModeType;
  startDrawing?: boolean;

  // Callbacks (replacements for dispatch(action))
  toggleUIMode: (mode: any) => void;
  setShapes: (shapes: MeasurementShape[]) => void;
  setActiveShape: (id: number | string | null) => void;
  setVisibleShapes: (shapes: MeasurementShape[]) => void;
  setDrawingShape: (status: boolean) => void;
  setShowAll: (value: boolean) => void;
  setDeleteAll: (value: boolean) => void;
  setMoveToShape: (id: number | string | null) => void;
  setUpdateShape: (status: boolean) => void;
  setMapMovingEnd: (status: boolean) => void;
  addShape: (any) => void;
  deleteShapeById: (id: number | string) => void;
  updateShapeById: (
    id: number | string,
    newCoordinates?: any,
    newDistance?: number,
    newSquare?: number
  ) => void;
  setLastVisibleShapeActive: () => void;
  setDrawingWithLastActiveShape: () => void;
  setActiveShapeIfDrawCancelled: () => void;
  updateAreaOfDrawing: (area: number) => void;
  deleteVisibleShapeById: (id: number | string) => void;

  // Optional handlers that were previously passed into control options
  polygonActiveIcon?: string;
  polygonIcon?: string;
}

const MapMeasurement = ({
  measurementShapes,
  activeShape,
  ifDrawing,
  showAllMeasurements,
  deleteShape,
  visibleShapes,
  moveToShape,
  mode,
  startDrawing,
  toggleUIMode,
  setShapes,
  setActiveShape,
  setVisibleShapes,
  setDrawingShape,
  setShowAll,
  setDeleteAll,
  setMoveToShape,
  setUpdateShape,
  setMapMovingEnd,
  addShape,
  deleteShapeById,
  updateShapeById,
  setLastVisibleShapeActive,
  setDrawingWithLastActiveShape,
  setActiveShapeIfDrawCancelled,
  updateAreaOfDrawing,
  deleteVisibleShapeById,
  polygonActiveIcon,
  polygonIcon,
}: MapMeasurementProps) => {
  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);

  const [measureControl, setMeasureControl] = useState(null);
  const [visiblePolylines, setVisiblePolylines] = useState();
  const [drawingShape, setDrawingLine] = useState(null);

  const device = useDeviceDetection();

  const toggleMeasurementModeHandler = () => {
    toggleUIMode("measurement");
  };

  useEffect(() => {
    if (routedMapRef?.leafletMap && !measureControl) {
      const mapExample = routedMapRef?.leafletMap?.leafletElement;
      const customOptions = {
        position: "topright",
        icon_lineActive: makeMeasureActiveIcon,
        icon_lineInactive: makeMeasureIcon,
        icon_polygonActive: polygonActiveIcon,
        icon_polygonInactive: polygonIcon,
        activeShape,
        mode_btn: `<div id='draw-shape-active' class='measure_button_wrapper'><div class='add_shape'>+</div></div>`,
        msj_disable_tool: "Do you want to disable the tool?",
        device,
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
        cbChangeActiveCanceldShapeId: changeActiveCancelledShapeId,
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
        (s) => s.shapeId === activeShape
      );
      const map = routedMapRef.leafletMap.leafletElement;

      if (ifDrawing) {
        setMoveToShape(null);
      }

      if (shapeCoordinates[0]?.shapeId && !ifDrawing && !deleteShape) {
        measureControl.changeColorByActivePolyline(
          map,
          shapeCoordinates[0].shapeId
        );
      }
      if (showAllMeasurements) {
        const allPolylines = measureControl.getAllPolylines(map);
        measureControl.fitMapToPolylines(map, allPolylines);
        setShowAll(false);
      }

      if (deleteShape) {
        setMoveToShape(null);
        measureControl.removePolylineById(map, activeShape);
        const cleanArr = visibleShapes.filter((m) => m.shapeId !== activeShape);
        deleteShapeHandler(activeShape);
        setVisibleShapes(cleanArr);

        const cleanAllArr = measurementShapes.filter(
          (m) => m.shapeId !== activeShape
        );
        setShapes(cleanAllArr);
        setDeleteAll(false);
        if (measureControl.options.shapes.length === 1) {
          measureControl.options.shapes = [];
        }
        const cleanLocalLefletShapes = measureControl.options.shapes.filter(
          (m) => m.shapeId !== activeShape
        );

        measureControl.options.shapes = cleanLocalLefletShapes;
      }
      if (moveToShape && !deleteShape) {
        if (shapeCoordinates.length > 0) {
          measureControl.showActiveShape(map, shapeCoordinates[0]?.coordinates);
        }
      }
    }

    if (measureControl) {
      const map = routedMapRef.leafletMap.leafletElement;
      measureControl.changeMeasurementMode(mode, map);
      const shapeCoordinates = measurementShapes.filter(
        (s) => s.shapeId === activeShape
      );
      if (shapeCoordinates[0]?.shapeId) {
        measureControl.changeColorByActivePolyline(
          map,
          shapeCoordinates[0].shapeId
        );
      }

      if (mode === "measurement" && visibleShapes.length === 0) {
        const visibleShapesIds = measureControl.getVisibleShapeIdsArr(
          measureControl._map
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
        measurementShapes
      );
      setVisibleShapes(cleanedVisibleArr);

      measureControl.changeMeasurementsArr(measurementShapes);
    }
  }, [visiblePolylines, measurementShapes]);

  useEffect(() => {
    if (drawingShape) {
      const cleanArr = visibleShapes.filter((m) => m.shapeId !== 5555);
      setVisibleShapes([...cleanArr, drawingShape]);
    } else {
      setLastVisibleShapeActive();
    }
  }, [drawingShape]);

  const saveShapeHandler = (layer) => {
    addShape([...measurementShapes, layer]);
  };
  const deleteShapeHandler = (id) => {
    deleteShapeById(id);
  };
  const deleteVisibleShapeByIdHandler = (id) => {
    deleteVisibleShapeById(id);
  };
  const updateShapeHandler = (id, newCoordinates, newDistance, newSquare) => {
    updateShapeById(id, newCoordinates, newDistance, newSquare);
  };

  const saveLastActiveShapeIdBeforeDrawingHandler = () => {
    setDrawingWithLastActiveShape();
  };
  const changeActiveCancelledShapeId = () => {
    setActiveShapeIfDrawCancelled();
  };

  const visiblePolylinesChange = (arr) => {
    setVisiblePolylines(arr);
  };

  const drawingStatusHandler = (status) => {
    setDrawingShape(status);
    setStartDrawing(status);
  };

  const drawingShapeHandler = (draw) => {
    setDrawingLine(draw);
  };
  const setActiveShapeHandler = (id) => {
    setActiveShape(id);
    setMoveToShape(null);
  };
  const setUpdateStatusHandler = (status) => {
    setUpdateShape(status);
  };
  const mapMovingEndHandler = (status) => {
    setMapMovingEnd(status);
  };

  const updateAreaOfDrawingMeasurementHandler = (newArea) => {
    updateAreaOfDrawing(newArea);
  };

  console.debug("RENDER: [MAPMEASUREMENT] MapMeasurement");

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
