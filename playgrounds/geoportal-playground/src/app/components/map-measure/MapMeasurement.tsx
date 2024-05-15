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
} from '../../store/slices/measurements';
interface TopicMapContextType {
  routedMapRef: any;
}

const MapMeasurement = (props) => {
  const { routedMapRef } = useContext<TopicMapContextType>(TopicMapContext);

  const dispatch = useDispatch();
  const measurementShapes = useSelector(getShapes);
  const activeShape = useSelector(getActiveShapes);

  const [measureControl, setMeasureControl] = useState(null);
  const [polygons, setPolygons] = useState(measurementShapes);
  const [visiblePolylines, setVisiblePolylines] = useState();
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
        shapes: polygons,
        cb: toggleMeasureToolState,
        cbSaveShape: saveShapeHandler,
        cbUpdateShape: updateShapeHandler,
        cdDeleteShape: deleteShapeHandler,
        cbVisiblePolylinesChange: visiblePolylinesChange,
      };

      const measurePolygonControl = L.control.measurePolygon(customOptions);
      measurePolygonControl.addTo(mapExample);
      setMeasureControl(measurePolygonControl);
    }
  }, [routedMapRef]);

  useEffect(() => {
    const addShapeSimpleNumber = polygons.map((s, idx) => ({
      ...s,
      number: idx + 1,
    }));
    dispatch(setShapes(addShapeSimpleNumber));

    if (polygons.length !== 0) {
      dispatch(setActiveShape(polygons[polygons.length - 1].shapeId));
    }
  }, [polygons]);

  useEffect(() => {
    if (measureControl && activeShape) {
      const shapeCoordinates = measurementShapes.filter(
        (s) => s.shapeId === activeShape
      );
      const map = routedMapRef.leafletMap.leafletElement;
      // This code move map and make a bug with visible measurements switching
      // measureControl.showActiveShape(map, shapeCoordinates[0].coordinates);
      measureControl.changeColorByActivePolyline(
        map,
        shapeCoordinates[0].shapeId
      );
    }
  }, [activeShape, measureControl]);

  useEffect(() => {
    if (measureControl) {
      const cleanedVisibleArr = filterArrByIds(
        visiblePolylines,
        measurementShapes
      );
      dispatch(setVisibleShapes(cleanedVisibleArr));
    }
  }, [visiblePolylines, measurementShapes]);

  const toggleMeasureToolState = (status) => {
    setCheckMeasureTool(status);
    setMeasurements({ area: '' });
  };
  const saveShapeHandler = (layer) => {
    console.log('ppp save', polygons);

    setPolygons((prevPolygons) => [...prevPolygons, layer]);
  };
  const deleteShapeHandler = (id) => {
    setPolygons((prevPolygons) => {
      const cleaerShapesArr = prevPolygons.filter((s) => s.shapeId !== id);
      return cleaerShapesArr;
    });
  };
  const updateShapeHandler = (id, newCoordinates, newDistance) => {
    setPolygons((prevPolygons) => {
      const cleaerShapesArr = prevPolygons.map((s) => {
        if (s.shapeId === id) {
          return {
            ...s,
            coordinates: newCoordinates,
            distance: newDistance,
          };
        } else {
          return s;
        }
      });
      return cleaerShapesArr;
    });
  };

  const visiblePolylinesChange = (arr) => {
    setVisiblePolylines(arr);
  };

  return (
    <div>
      {/* {checkMeasureTool && <MeasurementResults data={measurements} />} */}
    </div>
  );
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
