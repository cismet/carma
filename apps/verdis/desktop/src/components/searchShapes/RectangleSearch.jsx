import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import { useSelector, useDispatch } from "react-redux";
import { useContext, useEffect } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";

const RectangleSearch = () => {
  const { routedMapRef } = useContext(TopicMapContext);
  const map = routedMapRef?.leafletMap?.leafletElement;
  const drawControlRef = useRef(null);
  useEffect(() => {
    if (map) {
      const options = {
        draw: {
          polygon: false,
          polyline: false,
          circle: false,
          marker: false,
          circlemarker: false,
          rectangle: {
            shapeOptions: {
              color: "#f357a1",
              weight: 4,
            },
          },
        },
        edit: {
          featureGroup: new L.FeatureGroup(),
          remove: true,
        },
      };

      drawControlRef.current = new L.Control.Draw(drawOptions);
      map.addControl(drawControlRef.current);

      map.on(L.Draw.Event.CREATED, (event) => {
        const { layer } = event;
        map.addLayer(layer);
        console.log("xxx rec created:", layer.getBounds());
      });

      return () => {
        map.off(L.Draw.Event.CREATED);
        if (drawControlRef.current) {
          map.removeControl(drawControlRef.current);
        }
      };
    }
  }, [map]);

  const startDrawingRectangle = () => {
    if (map && drawControlRef.current) {
      const rectangleHandler = new L.Draw.Rectangle(
        map,
        drawControlRef.current.options.draw.rectangle
      );
      rectangleHandler.enable();
    }
  };

  return <div onClick={startDrawingRectangle}>Start drawing</div>;
};

export default RectangleSearch;
