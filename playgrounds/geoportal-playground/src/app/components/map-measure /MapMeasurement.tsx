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
import './m-style.css';

interface TopicMapContextType {
  routedMapRef: any;
}

const MapMeasurement = (props) => {
  const { routedMapRef } = useContext<TopicMapContextType>(TopicMapContext);

  const [measurements, setMeasurements] = useState({ area: '' });
  const [measureControl, setMeasureControl] = useState(null);
  const [checkMeasureTool, setCheckMeasureTool] = useState(false);
  const [polygons, setPolygons] = useState(['test']);
  // const savedLayerGroup = this._measureLayers.toGeoJSON();

  useEffect(() => {
    if (routedMapRef && !measureControl) {
      const mapExample = routedMapRef.leafletMap.leafletElement;
      const customOptions = {
        position: 'topleft',
        icon_lineActive: makeMeasureActiveIcon,
        icon_lineInactive: makeMeasureIcon,
        color_polygon: 'blue',
        fillColor_polygon: 'green',
        weight_polygon: 5,
        msj_disable_tool: 'Do you want to disable the tool?',
        cb: toggleMeasureToolState,
        cbSaveShape: saveShapeHandler,
        cdDeleteShape: deleteShapeHandler,
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
    console.log('ppp', polygons);
  }, [polygons]);

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
      console.log('yyy id', id);
      console.log('yyy previous polygons', prevPolygons);
      const cleaerShapesArr = prevPolygons.filter((s) => s.shapeId !== id);
      console.log('yyy cleaerShapesArr', cleaerShapesArr);
      return cleaerShapesArr;
    });
  };

  return (
    <div>
      <button onClick={deleteShapeHandler}>asddd</button>
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
      // Convert perimeter to kilometers and round to 2 decimal places
      return `${(perimeter / 1000).toFixed(2)} km`;
    } else {
      // Display perimeter in meters and round to 2 decimal places
      return `${perimeter.toFixed(2)} m`;
    }
  };

  // Call the formatPerimeter function to format the perimeter measurement
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
