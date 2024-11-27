import { useContext, useEffect, useRef, useState } from "react";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import proj4 from "proj4";
import bbox from "@turf/bbox";
import { convertBBox2Bounds, proj4crs3857def } from "../../helper/gisHelper";
// import { ProjGeoJson } from "react-cismap";
import { useSelector } from "react-redux";
import { getUIMode } from "../../store/slices/ui";
import { getScale } from "../../store/slices/print";
import ProjGeoJson from "react-cismap/ProjGeoJson";

const PrintBBoxMap = () => {
  function calculateBBox(
    centerX,
    centerY,
    pixelWidth,
    pixelHeight,
    dpi,
    scale
  ) {
    // Convert DPI and scale to meters per pixel
    const metersPerPixel = (0.0254 / dpi) * scale;

    // Calculate the half dimensions in real-world units
    const halfWidth = (pixelWidth * metersPerPixel) / 2;
    const halfHeight = (pixelHeight * metersPerPixel) / 2;

    // Calculate the bounding box
    const minX = centerX - halfWidth;
    const maxX = centerX + halfWidth;
    const minY = centerY - halfHeight;
    const maxY = centerY + halfHeight;

    // Return the result as a JSON object
    return {
      minX: minX,
      minY: minY,
      maxX: maxX,
      maxY: maxY,
    };
  }
  function createFeatureFromBBox(bbox) {
    return {
      type: "Polygon",
      crs: { type: "name", properties: { name: "EPSG:3857" } },
      coordinates: [
        [
          [bbox.minX, bbox.minY], // Bottom-left
          [bbox.maxX, bbox.minY], // Bottom-right
          [bbox.maxX, bbox.maxY], // Top-right
          [bbox.minX, bbox.maxY], // Top-left
          [bbox.minX, bbox.minY], // Close the polygon
        ],
      ],
    };
  }
  //   const { setBoundingBox, setLocation, setRoutedMapRef } = useContext(
  //     TopicMapDispatchContext
  //   );
  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);
  const mode = useSelector(getUIMode);
  const scale = useSelector(getScale);

  const [feature, setFeature] = useState();
  const featureref = useRef(feature);
  useEffect(() => {
    console.log("xxx featureref", feature);
    featureref.current = feature;
  }, [feature]);

  const clickHandlerForScale = (scale) => {
    if (routedMapRef) {
      setFeature(undefined);
      const map = routedMapRef.leafletMap.leafletElement;
      const latLngCenter = map.getCenter();
      const pointCenter = proj4("EPSG:4326", "EPSG:3857", [
        latLngCenter.lng,
        latLngCenter.lat,
      ]);

      console.log("xxx", { pointCenter, latLngCenter, map });
      const f = createFeatureFromBBox(
        calculateBBox(pointCenter[0], pointCenter[1], 555, 802, 72, scale)
      );

      console.log("xxx f", f);
      setFeature(f);
      const bb = bbox(f);
      const bounds = convertBBox2Bounds(bb, proj4crs3857def);
      const ul = proj4("EPSG:3857", "EPSG:4326", [bb[0], bb[1]]);
      const lr = proj4("EPSG:3857", "EPSG:4326", [bb[2], bb[3]]);

      const divUL = map.latLngToContainerPoint([ul[1], ul[0]]);
      const divLR = map.latLngToContainerPoint([lr[1], lr[0]]);

      map.fitBounds(bounds);

      console.log("xxx bbox", {
        bb,
        bounds,
        ul,
        lr,
        divUL,
        divLR,
      });
    }
  };

  useEffect(() => {
    if (mode === "print") {
      clickHandlerForScale(scale);
    }
  }, [mode, scale]);

  return (
    <>
      {feature && mode === "print" && (
        <ProjGeoJson
          key={JSON.stringify(feature)}
          editable={true}
          style={(feature) => {
            return { radius: 10 };
          }}
          featureCollection={[feature]}
          editModeStatusChanged={(feature) => {
            console.log("xxx feature", feature);
          }}
        />
      )}
    </>
  );
};

export default PrintBBoxMap;
