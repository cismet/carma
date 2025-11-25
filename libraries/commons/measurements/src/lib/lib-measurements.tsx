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
import "./styles/m-style.css";
import useDeviceDetection from "./hooks/useDeviceDetection";
import { useMapMeasurementsContext } from "./components/MapMeasurementsProvider";
import { MapMeasurementProps, MeasurementShapeDrawing } from "..";
import { MeasurementsSnapping } from "./components/MeasurementsSnapping";
import { MeasurementStatusDebug } from "./components/MeasurementStatusDebug";

export function Measurements({
  mode: propMode,
  polygonActiveIcon,
  polygonIcon,
  snappingLayers,
}: Partial<MapMeasurementProps> & {
  snappingLayers?: any[]; // MapLibre layers for snapping
}) {
  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);
  const {
    mode,
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
    setCurrentDrawHandler,
    snappingLatlng,
    config,
    setStatus,

    // looks unuseful
    setStartDrawing,
  } = useMapMeasurementsContext();

  // Use context mode if propMode is not provided
  const currentMode = propMode !== undefined ? propMode : mode;

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
        // icon_lineActive: makeMeasureActiveIcon,
        // icon_lineInactive: makeMeasureIcon,
        icon_polygonActive: polygonActiveIcon,
        icon_polygonInactive: polygonIcon,
        activeShape,
        mode_btn: `<div id='draw-shape-active' class='measure_button_wrapper'><div class='add_shape'>+</div></div>`,
        msj_disable_tool: "Do you want to disable the tool?",
        device,
        shapes,
        snappingLatlng,
        snappingEnabled: config.snappingEnabled,
        cbSaveShape: saveShapeHandler,
        cbUpdateShape: updateShapeHandler,
        cdDeleteShape: deleteShapeHandler,
        cbDeleteVisibleShapeById: deleteVisibleShapeByIdHandler,
        cbVisiblePolylinesChange: visiblePolylinesChange,
        cbSetDrawingStatus: drawingStatusHandler,
        cbSetDrawingShape: drawingShapeHandler,
        measurementOrder: findLargestNumber(shapes),
        measurementMode: currentMode,
        cbSetActiveShape: setActiveShapeHandler,
        cbSetUpdateStatusHandler: setUpdateStatusHandler,
        cbMapMovingEndHandler: mapMovingEndHandler,
        cbSaveLastActiveShapeIdBeforeDrawingHandler:
          saveLastActiveShapeIdBeforeDrawingHandler,
        cbChangeActiveCanceldShapeId: changeActiveCancelledShapeId,
        cbToggleMeasurementMode: toggleMeasurementModeHandler,
        cbUpdateAreaOfDrawingMeasurement: updateAreaOfDrawingMeasurementHandler,
        cbSetCurrentDrawHandler: setCurrentDrawHandler,
        cbSetMapStatus: setStatus,
      };

      const measurePolygonControl = (L.control as any).measurePolygon(
        customOptions
      );
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
      measureControl.changeMeasurementMode(currentMode, map);
      const shapeCoordinates = shapes.filter((s) => s.shapeId === activeShape);
      if (shapeCoordinates[0]?.shapeId) {
        measureControl.changeColorByActivePolyline(
          map,
          shapeCoordinates[0].shapeId
        );
      }

      if (currentMode === "measurement" && visibleShapes.length === 0) {
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
    currentMode,
  ]);

  // keep snappingLatlng and snappingEnabled in sync with control options
  useEffect(() => {
    if (measureControl) {
      try {
        // Update both snappingEnabled and snappingLatlng
        measureControl.options.snappingEnabled = config.snappingEnabled;
        // Force null when snapping is disabled, otherwise use the actual value
        measureControl.options.snappingLatlng = config.snappingEnabled
          ? snappingLatlng
          : null;
      } catch (_) {}
    }
  }, [snappingLatlng, measureControl, config.snappingEnabled]);

  useEffect(() => {
    if (measureControl) {
      const cleanedVisibleArr = filterArrByIds(visiblePolylines, shapes);

      // Preserve drawing shape (5555) if we're in drawing mode
      const drawingShapeInVisible = visibleShapes.find(
        (s) => s.shapeId === 5555
      );
      if (
        ifDrawing &&
        drawingShapeInVisible &&
        !cleanedVisibleArr.find((s) => s.shapeId === 5555)
      ) {
        cleanedVisibleArr.push(drawingShapeInVisible);
      }

      setVisibleShapes(cleanedVisibleArr);
      measureControl.changeMeasurementsArr(shapes);
    }
  }, [visiblePolylines, shapes, ifDrawing]);

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

  return (
    <>
      <div></div>
      <MeasurementStatusDebug />
      {currentMode === "measurement" && (
        <MeasurementsSnapping maplibreMaps={snappingLayers || []} />
      )}
    </>
  );
}

function filterArrByIds(
  arrIds: (string | number)[],
  fullArray: MeasurementShapeDrawing[]
): MeasurementShapeDrawing[] {
  const finalResult: MeasurementShapeDrawing[] = [];
  fullArray.forEach((currentItem) => {
    if (arrIds.includes(currentItem.shapeId)) {
      finalResult.push(currentItem);
    }
  });

  return finalResult;
}

function findLargestNumber(measurements: MeasurementShapeDrawing[]): number {
  let largestNumber = 0;

  measurements.forEach((item) => {
    if (item.number > largestNumber) {
      largestNumber = item.number;
    }
  });

  return largestNumber;
}

/**
 * @deprecated Use `Measurements` instead. This component will be removed in a future version.
 */
export function MapMeasurementsObjects(
  props: Partial<MapMeasurementProps> & {
    snappingEnabled?: boolean;
    snappingLayer?: any;
  }
) {
  return <Measurements {...props} />;
}
