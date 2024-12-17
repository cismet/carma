import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet-draw";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";

const RectangleSearch = ({ routedMapRef }) => {
  //   const { routedMapRef } = useContext(TopicMapContext);
  const map = routedMapRef?.leafletMap?.leafletElement;
  //   const drawControlRef = useRef(null);
  useEffect(() => {
    console.log("xxx map", map);

    // const map = routedMapRef?.leafletMap?.leafletElement;
    if (map) {
      const editableLayers = new L.FeatureGroup();
      map.addLayer(editableLayers);

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
          featureGroup: editableLayers,
          remove: false,
        },
      };

      const drawControl = new L.Control.Draw(options);
      map.addControl(drawControl);

      //   map.on(L.Draw.Event.CREATED, (event) => {
      //     const { layer } = event;
      //     map.addLayer(layer);
      //     console.log("xxx rec created:", layer.getBounds());
      //   });

      //   return () => {
      //     map.off(L.Draw.Event.CREATED);
      //     if (drawControlRef.current) {
      //       map.removeControl(drawControlRef.current);
      //     }
      //   };
    }
  }, [routedMapRef]);

  const startDrawingRectangle = (map, drawControlRef) => {
    console.log("xxx map, drawControlRef", map, drawControlRef);
    if (map && drawControlRef.current) {
      const rectangleHandler = new L.Draw.Rectangle(
        map,
        drawControlRef.current.options.draw.rectangle
      );
      rectangleHandler.enable();
    }
  };

  return (
    <div
      id="test-start-drawing"
      //   onClick={() => startDrawingRectangle(map, drawControlRef)}
      className="absolute top-[120px] left-0 z-[1000]"
    >
      {/* Start drawing */}
    </div>
  );
};

export default RectangleSearch;
