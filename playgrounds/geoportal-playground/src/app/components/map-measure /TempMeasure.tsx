import React, { useState, useEffect, useRef, useContext } from 'react';
// import RoutedMap from '../RoutedMap';
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

const TempMeasure = (props) => {
  const { routedMapRef } = useContext(TopicMapContext);

  const [measurements, setMeasurements] = useState({ area: '' });
  const [measureControl, setMeasureControl] = useState(null);
  const [checkMeasureTool, setCheckMeasureTool] = useState(false);

  useEffect(() => {
    // if (!mapRef.current) return;
    if (routedMapRef && !measureControl) {
      // routedMapRef.leafletMap.leafletElement.editable = true;
      const mapExample = routedMapRef.leafletMap.leafletElement;
      console.log('xxx map', mapExample);

      const customOptions = {
        position: 'topleft',
        icon_active: makeMeasureActiveIcon,
        icon_inactive: makeMeasureIcon,
        color_polygon: 'blue',
        fillColor_polygon: 'green',
        weight_polygon: 5,
        msj_disable_tool: 'Do you want to disable the tool?',
        cb: toggleMeasureToolState,
      };

      const measurePolygonControl = L.control.measurePolygon(customOptions);
      measurePolygonControl.addTo(mapExample);
      setMeasureControl(measurePolygonControl);

      // Subscribe to the draw:created event
      mapExample.on('draw:created', (event) => {
        const layer = event.layer;
        const latlngs = layer.getLatLngs()[0];
        const area = L.GeometryUtil.geodesicArea(latlngs);
        const perimeter = calculatePerimeter(layer);
        setMeasurements((prev) => ({ ...prev, area, perimeter }));
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
    if (routedMapRef) {
      console.log('mmm', routedMapRef.leafletMap.leafletElement);
    }
  }, [routedMapRef, measureControl]);

  const handleVertexDrag = (event) => {
    // Recalculate area when vertex is dragged
    const layer = event.layer;
    const latlngs = layer.getLatLngs()[0];
    const area = L.GeometryUtil.geodesicArea(latlngs);
    const perimeter = calculatePerimeter(layer);
    setMeasurements((prev) => ({ ...prev, area, perimeter }));
  };

  const handleVertexDeleted = () => {
    console.log('delete');
    // Recalculate area when vertex is deleted
    const latlngs = mapRef.current.leafletElement.editTools.featuresLayer
      .getLayers()[0]
      .getLatLngs()[0];
    const perimeter = calculatePerimeter(latlngs);
    const area = L.GeometryUtil.geodesicArea(latlngs);
    setMeasurements((prev) => ({ ...prev, area, perimeter }));
  };

  const toggleMeasure = () => {
    if (measureControl) {
      measureControl._toggleMeasure();
    }
  };

  const toggleMeasureToolState = (status) => {
    setCheckMeasureTool(status);
    setMeasurements({ area: '' });
  };

  return (
    <div>
      {/* <button onClick={toggleMeasure}>Toggle Measure</button>{' '} */}
      {checkMeasureTool && <MeasurementResults data={measurements} />}
    </div>
  );
};

export default TempMeasure;

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
          {data.area !== '' ? data.area.toFixed(2) : ''} m²
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

  return `${perimeter.toLocaleString('en-US', options)} m`;
}
