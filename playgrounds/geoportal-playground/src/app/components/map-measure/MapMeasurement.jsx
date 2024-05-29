import React, { useState, useEffect, useContext } from 'react';
import { TopicMapContext } from 'react-cismap/contexts/TopicMapContextProvider';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import L from 'leaflet';
import 'leaflet-draw';
import 'leaflet-editable';
import 'leaflet-measure-path';
import './measure-path';
import 'leaflet-measure-path/leaflet-measure-path.css';
import makeMeasureIcon from './measure.png';
import makeMeasureActiveIcon from './measure-active.png';
import polygonIcon from './polygon.png';
import polygonActiveIcon from './polygon-active.png';
import './m-style.css';
import { useSelector, useDispatch } from 'react-redux';
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
} from '../../store/slices/measurements';

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

  const [measureControl, setMeasureControl] = useState(null);
  const [visiblePolylines, setVisiblePolylines] = useState();
  const [drawingShape, setDrawingLine] = useState(null);

  useEffect(() => {
    if (routedMapRef && !measureControl) {
      const mapExample = routedMapRef.leafletMap.leafletElement;
      const customOptions = {
        position: 'topleft',
        icon_lineActive: makeMeasureActiveIcon,
        icon_lineInactive: makeMeasureIcon,
        icon_polygonActive: polygonActiveIcon,
        icon_polygonInactive: polygonIcon,
        activeShape,
        msj_disable_tool: 'Do you want to disable the tool?',
        shapes: measurementShapes,
        cbSaveShape: saveShapeHandler,
        cbUpdateShape: updateShapeHandler,
        cdDeleteShape: deleteShapeHandler,
        cbVisiblePolylinesChange: visiblePolylinesChange,
        cbSetDrawingStatus: drawingStatusHandler,
        cbSetDrawingShape: drawingShapeHandler,
        measurementOrder: findLargestNumber(measurementShapes),
        cbSetActiveShape: setActiveShapeHandler,
        cbSetUpdateStatusHandler: setUpdateStatusHandler,
        cbMapMovingEndHandler: mapMovingEndHandler,
      };

      const measurePolygonControl = L.control.measurePolygon(customOptions);
      measurePolygonControl.addTo(mapExample);
      setMeasureControl(measurePolygonControl);
    }
  }, [routedMapRef]);

  useEffect(() => {
    console.log('www uef delete update move');

    if (measureControl && activeShape) {
      const shapeCoordinates = measurementShapes.filter(
        (s) => s.shapeId === activeShape
      );
      const map = routedMapRef.leafletMap.leafletElement;

      if (ifDrawing) {
        dispatch(setMoveToShape(null));
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
        dispatch(setShowAllMeasurements(false));
      }

      if (deleteShape) {
        console.log('www', deleteShape);
        dispatch(setMoveToShape(null));
        measureControl.removePolylineById(map, activeShape);
        const cleanArr = visibleShapes.filter((m) => m.shapeId !== activeShape);
        deleteShapeHandler(activeShape);
        dispatch(setVisibleShapes(cleanArr));

        const cleanAllArr = measurementShapes.filter(
          (m) => m.shapeId !== activeShape
        );
        dispatch(setShapes(cleanAllArr));
        dispatch(setDeleteMeasurements(false));
      }
      if (moveToShape && !deleteShape) {
        measureControl.showActiveShape(map, shapeCoordinates[0]?.coordinates);
      }
    }
  }, [
    activeShape,
    measureControl,
    showAllMeasurements,
    deleteShape,
    ifDrawing,
    moveToShape,
  ]);

  useEffect(() => {
    console.log('www uef visiblePolylines');

    if (measureControl) {
      const cleanedVisibleArr = filterArrByIds(
        visiblePolylines,
        measurementShapes
      );
      dispatch(setVisibleShapes(cleanedVisibleArr));
    }
  }, [visiblePolylines, measurementShapes]);

  useEffect(() => {
    console.log('www uef drawing');
    if (drawingShape) {
      const cleanArr = visibleShapes.filter((m) => m.shapeId !== 5555);
      dispatch(setVisibleShapes([...cleanArr, drawingShape]));
    } else {
      dispatch(setLastVisibleShapeActive());
    }
  }, [drawingShape]);

  const saveShapeHandler = (layer) => {
    dispatch(addShape(layer));
  };
  const deleteShapeHandler = (id) => {
    dispatch(deleteShapeById(id));
  };
  const updateShapeHandler = (id, newCoordinates, newDistance) => {
    dispatch(updateShapeById(id, newCoordinates, newDistance));
  };

  // const updateShapeTitleStatusHandler = (id) => {
  //   const shapeFromVisible = visibleShapes.filter((s) => s.shapeId === id);
  //   setAllShapes((prevPolygons) => {
  //     const cleaerShapesArr = prevPolygons.map((s) => {
  //       if (s.shapeId === id) {
  //         return {
  //           ...s,
  //           customTitle: shapeFromVisible[0].customTitle,
  //         };
  //       } else {
  //         return s;
  //       }
  //     });
  //     return cleaerShapesArr;
  //   });
  // };

  const visiblePolylinesChange = (arr) => {
    setVisiblePolylines(arr);
  };

  const drawingStatusHandler = (status) => {
    dispatch(setDrawingShape(status));
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
