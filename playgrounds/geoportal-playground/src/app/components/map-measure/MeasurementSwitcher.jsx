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
import { useSelector, useDispatch } from 'react-redux';
import { toggleMeasurementMode } from '../../store/slices/measurements';

const MeasurementSwitcher = (props) => {
  const { routedMapRef } = useContext(TopicMapContext);

  const dispatch = useDispatch();

  const [measureControl, setMeasureControl] = useState(null);

  useEffect(() => {
    if (routedMapRef && !measureControl) {
      const mapExample = routedMapRef.leafletMap.leafletElement;
      const customOptions = {
        position: 'topleft',
        icon_lineActive: makeMeasureActiveIcon,
        icon_lineInactive: makeMeasureIcon,
        cbToggleMeasurementMode: toggleMeasurementModeHandler,
      };

      const measurePolygonControl = L.control.measurePolygon(customOptions);
      measurePolygonControl.addTo(mapExample);
      setMeasureControl(measurePolygonControl);
    }
  }, [routedMapRef]);

  const toggleMeasurementModeHandler = (status) => {
    dispatch(toggleMeasurementMode());
  };
};

export default MeasurementSwitcher;
