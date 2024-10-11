import { useState, useEffect } from "react";
import L from "leaflet";
import "leaflet-draw";
import "leaflet-editable";

import { findLargestNumber } from "../utils";

import makeMeasureIcon from "../measure.png";
import makeMeasureActiveIcon from "../measure-active.png";
import polygonIcon from "../polygon.png";
import polygonActiveIcon from "../polygon-active.png";

const useMeasureControl = ({
  routedMapRef,
  measurementShapes,
  activeShape,
  device,
  mode,
  handlers,
}) => {
  const [measureControl, setMeasureControl] = useState(null);

  useEffect(() => {
    if (routedMapRef && !measureControl) {
      const map = routedMapRef.leafletMap.leafletElement;
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
        measurementOrder: findLargestNumber(measurementShapes),
        measurementMode: mode,
        ...handlers,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const measurePolygonControl = (
        L.control as unknown as any
      ).measurePolygon(customOptions);
      measurePolygonControl.addTo(map);
      setMeasureControl(measurePolygonControl);
    }
  }, [
    routedMapRef,
    measureControl,
    measurementShapes,
    activeShape,
    device,
    mode,
    handlers,
  ]);

  return measureControl;
};

export default useMeasureControl;
