import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet-draw";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import { useSelector } from "react-redux";
import { getShapeMode } from "../../store/slices/searchMode";
window.type = true;
const RectangleSearch = ({ map }) => {
  const drawControlRef = useRef(null);
  const editableLayersRef = useRef(new L.FeatureGroup());
  const mode = useSelector(getShapeMode);
  useEffect(() => {
    console.log("xxx map", map);

    // const map = routedMapRef?.leafletMap?.leafletElement;
    if (map) {
      //   const editableLayers = new L.FeatureGroup();
      map.addLayer(editableLayersRef.current);

      //   const options = {
      //     draw: {
      //       polygon: false,
      //       polyline: false,
      //       circle: false,
      //       marker: false,
      //       circlemarker: false,
      //       rectangle: {
      //         shapeOptions: {
      //           color: "blue",
      //           weight: 4,
      //         },
      //       },
      //     },
      //     edit: {
      //       featureGroup: editableLayers,
      //       remove: false,
      //     },
      //   };

      //   drawControlRef.current = new L.Control.Draw(options);
      //   map.addControl(drawControlRef.current);

      //   map.on("draw:created", function (e) {
      //     const layer = e.layer;

      //     editableLayers.addLayer(layer);
      //   });
    }
  }, [map]);

  useEffect(() => {
    if (mode === "rectangle") {
      startDrawRect();
    }
  }, [map, mode]);

  const startDrawRect = () => {
    if (map) {
      if (drawControlRef.current) {
        drawControlRef.current.disable();
      }

      drawControlRef.current = new L.Draw.Rectangle(map, {
        shapeOptions: {
          color: "blue",
          weight: 4,
        },
      });

      drawControlRef.current.enable();

      map.once(L.Draw.Event.CREATED, (e) => {
        const layer = e.layer;
        editableLayersRef.current.addLayer(layer);
        drawControlRef.current.disable();

        setTimeout(() => {
          editableLayersRef.current.removeLayer(layer);
        }, 3000);
      });
    }
  };

  return null;
};

export default RectangleSearch;
