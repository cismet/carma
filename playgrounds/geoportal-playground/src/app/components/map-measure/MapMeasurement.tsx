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

  // const savedLayerGroup = this._measureLayers.toGeoJSON();
  const [measurements, setMeasurements] = useState({ area: '' });
  const [measureControl, setMeasureControl] = useState(null);
  const [checkMeasureTool, setCheckMeasureTool] = useState(false);
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
        // color_polygon: 'blue',
        // fillColor_polygon: 'green',
        // weight_polygon: 2,
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

      // Subscribe to the draw:created event
      mapExample.on('draw:created', (event) => {
        // const layer = event.layer;
        // const latlngs = layer.getLatLngs()[0];
        // const area = L.GeometryUtil.geodesicArea(latlngs);
        // const perimeter = calculatePerimeter(layer);
        // setMeasurements((prev) => ({ ...prev, area, perimeter }));
      });

      mapExample.on('editable:vertex:drag', handleVertexDrag);
      mapExample.on('editable:vertex:deleted', handleVertexDeleted);

      return () => {
        mapExample.off('editable:vertex:drag', handleVertexDrag);
        mapExample.off('editable:vertex:deleted', handleVertexDeleted);
      };
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
    console.log('nnn', measurementShapes);
  }, [measurementShapes]);
  useEffect(() => {
    if (measureControl && activeShape) {
      const shapeCoordinates = measurementShapes.filter(
        (s) => s.shapeId === activeShape
      );
      const map = routedMapRef.leafletMap.leafletElement;
      measureControl.showActiveShape(map, shapeCoordinates[0].coordinates);
      measureControl.changeColorByActivePolyline(
        map,
        shapeCoordinates[0].shapeId
      );
    }
  }, [activeShape, measureControl]);

  useEffect(() => {
    if (measureControl) {
      console.log('vvv options', visiblePolylines);
      console.log('vvv shapes', measurementShapes);
    }
  }, [visiblePolylines]);

  const handleVertexDrag = (event) => {
    // Recalculate area when vertex is dragged
    // const layer = event.layer;
    // const latlngs = layer.getLatLngs()[0];
    // const area = L.GeometryUtil.geodesicArea(latlngs);
    // const perimeter = calculatePerimeter(layer);
    // setMeasurements((prev) => ({ ...prev, area, perimeter }));
  };

  const handleVertexDeleted = () => {
    // const latlngs = mapRef.current.leafletElement.editTools.featuresLayer
    // const latlngs =
    //   routedMapRef.leafletMap.leafletElement.editTools.featuresLayer
    //     .getLayers()[0]
    //     .getLatLngs()[0];
    // const perimeter = calculatePerimeter(latlngs);
    // const area = L.GeometryUtil.geodesicArea(latlngs);
    // setMeasurements((prev) => ({ ...prev, area, perimeter }));
  };

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

const MeasurementResults = ({ data }) => {
  if (data.area === '') {
    return <div></div>;
  }
  return (
    <div style={styles.container}>
      <h3 style={styles.title}>Measurement Results</h3>
      <div style={styles.area}>
        <div>
          <strong>Square:</strong>{' '}
          {data.area !== '' ? formatArea(data.area) : ''}
        </div>
        <div>
          {' '}
          <strong>Distance:</strong>{' '}
          {data.perimeter !== '' ? data.perimeter : ''}
        </div>
      </div>
    </div>
  );
};

const styles = {
  container: {
    backgroundColor: 'white',
    padding: '10px',
  },
  title: {
    marginBottom: '10px',
  },
  area: {
    fontSize: '14px',
    // fontWeight: "bold",
  },
};

function calculatePerimeter(layer) {
  const latlngs = layer.getLatLngs()[0];

  let perimeter = 0;
  for (let i = 0; i < latlngs.length - 1; i++) {
    perimeter += latlngs[i].distanceTo(latlngs[i + 1]);
  }
  perimeter += latlngs[latlngs.length - 1].distanceTo(latlngs[0]);

  const options = {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  };

  const formatPerimeter = (perimeter) => {
    if (perimeter >= 1000) {
      return `${(perimeter / 1000).toFixed(2)} km`;
    } else {
      return `${perimeter.toFixed(2)} m`;
    }
  };

  return formatPerimeter(perimeter);
}

const formatArea = (area) => {
  if (area >= 1000000) {
    // Convert area to square kilometers and round to 2 decimal places
    return `${(area / 1000000).toFixed(2)} km²`;
  } else {
    // Display area in square meters and round to 2 decimal places
    return `${area.toFixed(2)} m²`;
  }
};
