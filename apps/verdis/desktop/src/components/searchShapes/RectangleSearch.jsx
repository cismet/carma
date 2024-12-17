import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet-draw";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import { useDispatch, useSelector } from "react-redux";
import {
  getShapeMode,
  storeKassenzeichenliste,
  storeShapeMode,
} from "../../store/slices/searchMode";
window.type = true;
const RectangleSearch = ({ map }) => {
  const dispatch = useDispatch();
  const drawControlRef = useRef(null);
  const editableLayersRef = useRef(new L.FeatureGroup());
  const mode = useSelector(getShapeMode);
  useEffect(() => {
    if (map) {
      map.addLayer(editableLayersRef.current);
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
          dispatch(
            storeKassenzeichenliste([
              "60037371",
              "60048907",
              "60058203",
              // "60053055",
              // "60082070",
              // "60090529",
              // "60099496",
              // "60108065",
              // "60108065",
              // "60108065",
              // "60108065",
              // "60116902",
            ])
          );
          editableLayersRef.current.removeLayer(layer);
          dispatch(storeShapeMode("default"));
        }, 3000);
      });
    }
  };

  return null;
};

export default RectangleSearch;
