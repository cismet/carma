import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet-draw";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
window.type = true;
const RectangleSearch = ({ map }) => {
  const drawControlRef = useRef(null);

  useEffect(() => {
    console.log("xxx map", map);

    // const map = routedMapRef?.leafletMap?.leafletElement;
    if (map && !drawControlRef.current) {
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
              color: "blue",
              weight: 4,
            },
          },
        },
        edit: {
          featureGroup: editableLayers,
          remove: false,
        },
      };

      drawControlRef.current = new L.Control.Draw(options);
      map.addControl(drawControlRef.current);

      map.on("draw:created", function (e) {
        const layer = e.layer;

        editableLayers.addLayer(layer);
      });
    }
  }, [map]);

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
