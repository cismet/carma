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
import { useMapMeasurementsContext } from "./components/MapMeasurementsProvider";

export interface MeasurementShape {
  shapeId: number | string;
  number: number;
  coordinates?: unknown;
  [key: string]: unknown;
}

export type UIModeType = string | "measurement" | "default";
export interface MapMeasurementProps {
  // measurementShapes: MeasurementShape[];
  // activeShape?: number | string | null;
  // ifDrawing?: boolean;
  // showAllMeasurements?: boolean;
  // deleteShape?: boolean;
  // visibleShapes: MeasurementShape[];
  // moveToShape?: number | string | null;
  mode?: UIModeType;

  // Callbacks (replacements for dispatch(action))
  // toggleUIMode: (mode: UIModeType) => void;

  // setShapes: (shapes: MeasurementShape[]) => void;
  // setActiveShape: (id: number | string | null) => void;
  // setVisibleShapes: (shapes: MeasurementShape[]) => void;
  // setDrawingShape: (status: boolean) => void;
  // setShowAll: (value: boolean) => void;
  // setDeleteAll: (value: boolean) => void;
  // setMoveToShape: (id: number | string | null) => void;
  // setUpdateShape: (status: boolean) => void;
  // setMapMovingEnd: (status: boolean) => void;
  // addShape: (layer: unknown) => void;
  // deleteShapeById: (id: number | string) => void;
  // updateShapeById: (
  //   id: number | string,
  //   newCoordinates?: unknown,
  //   newDistance?: number,
  //   newSquare?: number | null
  // ) => void;
  // setLastVisibleShapeActive: () => void;
  // setDrawingWithLastActiveShape: () => void;
  // setActiveShapeIfDrawCancelled: () => void;
  // updateAreaOfDrawing: (area: number) => void;
  // deleteVisibleShapeById: (id: number | string) => void;
  // setStartDrawing: (status: boolean) => void;

  // Optional handlers that were previously passed into control options
  polygonActiveIcon?: string;
  polygonIcon?: string;
}

export function MapMeasurementLib({
  // measurementShapes,
  // activeShape,
  // ifDrawing,
  // showAllMeasurements,
  // deleteShape,
  // visibleShapes,
  // moveToShape,
  mode,
  // toggleUIMode,
  // setShapes,
  // setActiveShape,
  // setVisibleShapes,
  // setDrawingShape,
  // setStartDrawing,
  // setShowAll,
  // setDeleteAll,
  // setMoveToShape,
  // setUpdateShape,
  // setMapMovingEnd,
  // addShape,
  // deleteShapeById,
  // updateShapeById,
  // setLastVisibleShapeActive,
  // setDrawingWithLastActiveShape,
  // setActiveShapeIfDrawCancelled,
  // updateAreaOfDrawing,
  // deleteVisibleShapeById,
  polygonActiveIcon,
  polygonIcon,
}: MapMeasurementProps) {
  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);
  const {
    activeShape,
    setActiveShape,
    shapes,
    setShapes,
    addShape,
    deleteAll,
    setDeleteAll,
    setUpdateShape,
    visibleShapes,
    setVisibleShapes,
    drawingShape: ifDrawing,
    setDrawingShape,
    moveToShape,
    setMoveToShape,
    showAll,
    setShowAll,
    toggleMeasurementMode: toggleUIMode,
    setMapMovingEnd,
    deleteShapeById,
    updateShapeById,
    setLastVisibleShapeActive,
    setDrawingWithLastActiveShape,
    setActiveShapeIfDrawCancelled,
    updateAreaOfDrawing,
    deleteVisibleShapeById,

    // looks unuseful
    setStartDrawing,
    startDrawing,
  } = useMapMeasurementsContext();

  const [measureControl, setMeasureControl] = useState<any>(null);
  const [visiblePolylines, setVisiblePolylines] = useState<(string | number)[]>(
    []
  );
  const [drawingShape, setDrawingLine] = useState(null);

  const device = useDeviceDetection();

  const toggleMeasurementModeHandler = () => {
    toggleUIMode();
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
        shapes,
        cbSaveShape: saveShapeHandler,
        cbUpdateShape: updateShapeHandler,
        cdDeleteShape: deleteShapeHandler,
        cbDeleteVisibleShapeById: deleteVisibleShapeByIdHandler,
        cbVisiblePolylinesChange: visiblePolylinesChange,
        cbSetDrawingStatus: drawingStatusHandler,
        cbSetDrawingShape: drawingShapeHandler,
        measurementOrder: findLargestNumber(shapes),
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
      const shapeCoordinates = shapes.filter((s) => s.shapeId === activeShape);
      const map = routedMapRef.leafletMap.leafletElement;

      if (ifDrawing) {
        setMoveToShape(null);
      }

      if (shapeCoordinates[0]?.shapeId && !ifDrawing && !deleteAll) {
        measureControl.changeColorByActivePolyline(
          map,
          shapeCoordinates[0].shapeId
        );
      }
      if (showAll) {
        const allPolylines = measureControl.getAllPolylines(map);
        measureControl.fitMapToPolylines(map, allPolylines);
        setShowAll(false);
      }

      if (deleteAll) {
        setMoveToShape(null);
        measureControl.removePolylineById(map, activeShape);
        const cleanArr = visibleShapes.filter((m) => m.shapeId !== activeShape);
        deleteShapeHandler(activeShape);
        setVisibleShapes(cleanArr);

        const cleanAllArr = shapes.filter((m) => m.shapeId !== activeShape);
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
      if (moveToShape && !deleteAll) {
        if (shapeCoordinates.length > 0) {
          measureControl.showActiveShape(map, shapeCoordinates[0]?.coordinates);
        }
      }
    }

    if (measureControl) {
      const map = routedMapRef.leafletMap.leafletElement;
      measureControl.changeMeasurementMode(mode, map);
      const shapeCoordinates = shapes.filter((s) => s.shapeId === activeShape);
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
    showAll,
    deleteAll,
    ifDrawing,
    moveToShape,
    mode,
  ]);

  useEffect(() => {
    if (measureControl) {
      const cleanedVisibleArr = filterArrByIds(visiblePolylines, shapes);
      setVisibleShapes(cleanedVisibleArr);

      measureControl.changeMeasurementsArr(shapes);
    }
  }, [visiblePolylines, shapes]);

  useEffect(() => {
    if (drawingShape) {
      const cleanArr = visibleShapes.filter((m) => m.shapeId !== 5555);
      setVisibleShapes([...cleanArr, drawingShape]);
    } else {
      setLastVisibleShapeActive();
    }
  }, [drawingShape]);

  const saveShapeHandler = (layer) => {
    addShape(layer);
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
}

function filterArrByIds(
  arrIds: (string | number)[],
  fullArray: MeasurementShape[]
): MeasurementShape[] {
  const finalResult: MeasurementShape[] = [];
  fullArray.forEach((currentItem) => {
    if (arrIds.includes(currentItem.shapeId)) {
      finalResult.push(currentItem);
    }
  });

  return finalResult;
}

function findLargestNumber(measurements: MeasurementShape[]): number {
  let largestNumber = 0;

  measurements.forEach((item) => {
    if (item.number > largestNumber) {
      largestNumber = item.number;
    }
  });

  return largestNumber;
}
