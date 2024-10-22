import { useState, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";

import L from "leaflet";
import "leaflet-draw";
import "leaflet-editable";

import { toggleMeasurementMode } from "../../store/slices/measurements";
import { getMeasurementMode } from "../../store/slices/measurements";
import { getLeafletElement } from "../../store/slices/topicmap";

import "./measure-path-switcher";

import "leaflet-measure-path/leaflet-measure-path.css";
import makeMeasureIcon from "./measure.png";
import makeMeasureActiveIcon from "./measure-active.png";
import "./m-style.css";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";

const MeasurementSwitcher = (props) => {
  const dispatch = useDispatch();

  // TODO pass leafletElement as prop ?
  const leafletElement = useSelector(getLeafletElement);
  const measurementMode = useSelector(getMeasurementMode);

  const [measureControl, setMeasureControl] = useState(null);

  useEffect(() => {
    let measurePolygonControl;
    if (leafletElement && !measureControl) {
      const customOptions = {
        position: "topleft",
        icon_lineActive: makeMeasureActiveIcon,
        icon_lineInactive: makeMeasureIcon,
        cbToggleMeasurementMode: toggleMeasurementModeHandler,
      };

      measurePolygonControl = L.control.measurePolygon(customOptions);
      measurePolygonControl.addTo(leafletElement);
      setMeasureControl(measurePolygonControl);
    }

    if (!measurementMode && measureControl) {
      leafletElement.removeControl(measureControl);
    }

    // return () => {
    //   measurePolygonControl.remove();
    //   setMeasureControl(null);
    // };
  }, [leafletElement, measurementMode]);

  const toggleMeasurementModeHandler = (status) => {
    dispatch(toggleMeasurementMode());
  };
};

export default MeasurementSwitcher;
