import "leaflet-path-drag";
import proj4 from "proj4";
import bbox from "@turf/bbox";
import { convertBBox2Bounds, proj4crs3857def } from "./gisHelper";
import * as L from "leaflet";

interface DraggablePolygonOptions extends L.PolylineOptions {
  draggable?: boolean;
  prevPrintId?: string;
}

interface CustomPolygon extends L.Polygon {
  prevPrintId?: string;
}

export const printMap = async (
  center,
  scale,
  layers,
  orientation,
  dpi,
  name,
  handleIsLoading,
  handleIsError
) => {
  const { url, title } = getOrientationTemplateParams(orientation);
  const data = {
    layout: title,
    attributes: {
      keywordsAtt: ["map", "example", "metadata"],
      map: {
        center,
        rotation: 0,
        longitudeFirst: true,
        layers,
        scale,
        projection: "EPSG:3857",
        dpi,
      },
    },
  };
  handleIsLoading(true);
  try {
    const response = await fetch(url, {
      method: "POST",
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const responseBody = await response.text();
      throw new Error(responseBody);
    }

    const blob = await response.blob();
    const urlBlob = URL.createObjectURL(blob);
    const newTab = window.open(); // Open a new tab
    newTab.location = urlBlob; // Set the URL of the new tab to the Blob URL

    // const a = document.createElement("a");
    // a.href = urlBlob;
    // a.download = name;
    // a.click();

    URL.revokeObjectURL(urlBlob);
    handleIsLoading(false);
  } catch (error) {
    console.log("xxx print error message", error?.message);
    handleIsLoading(false);
    handleIsError(error?.message || "An unexpected error occurred");
  } finally {
    const printPreview = document.querySelector(
      "path.leaflet-path-draggable.leaflet-interactive"
    ) as SVGPathElement | null;

    if (printPreview) {
      printPreview.style.cursor = "default";
    }
  }
};
export const getPrintLayers = (bgLayer, layers) => {
  const allLayers = [...layers, bgLayer];
  const layerPrint = [];
  allLayers.forEach((layer) => {
    if (layer.layerType === "wmts") {
      const { name, baseURL } = buildUrlWitName(
        layer.props?.url,
        layer.props.name
      );
      const layerCat = layer.other?.tags[0] ? layer.other.tags[0] : "Basic";
      if (layerCat === "Basic") {
        layerPrint.push(buildWMSPrint(baseURL, name, layer.opacity));
      } else {
        layerPrint.unshift(buildWMSPrint(baseURL, name, layer.opacity));
      }
    }

    // if (layer.layerType === "vector") {
    //   layerPrint.unshift(
    //     buildOMSPrint("https://tgl.cismet.de/styles/poi-style/256")
    //   );
    // }
  });

  return layerPrint;
};

const buildUrlWitName = (layerUrl, name) => {
  const url = layerUrl.split("?");
  if (name === "") {
    const name = url[1]
      .split("&")
      .filter((item) => item.startsWith("LAYER"))[0]
      .split("=")[1];

    return {
      name,
      baseURL: url[0],
    };
  }
  return {
    name,
    baseURL: url[0],
  };
};

const buildWMSPrint = (baseURL, name, opacity = 1) => {
  const wms = {
    imageFormat: "image/png",
    baseURL: baseURL,
    customParams: {
      EXCEPTIONS: "INIMAGE",
      TRANSPARENT: "true",
    },
    layers: [name],
    type: "WMS",
    opacity,
    failOnError: true,
  };

  return wms;
};

const buildOMSPrint = (baseURL) => {
  const oms = {
    baseURL: baseURL,
    type: "OSM",
    imageExtension: "png",
    tileMatrixSet: "zxy",
  };

  return oms;
};

const getOrientationTemplateParams = (orientation = "portrait") => {
  const landscape =
    "https://mapfish.cismet.de/print/A4_Landscape/buildreport.pdf";
  const portrait =
    "https://mapfish.cismet.de/print/A4_Portrait/buildreport.pdf";

  return {
    url: orientation === "portrait" ? portrait : landscape,
    title: orientation === "portrait" ? "A4 portrait" : "A4 landscape",
  };
};

export const scaleOptions = [
  {
    value: "250",
    label: "1 : 250",
  },
  {
    value: "500",
    label: "1 : 500",
  },
  {
    value: "1000",
    label: "1 : 1000",
  },
  {
    value: "2500",
    label: "1 : 2500",
  },
  {
    value: "5000",
    label: "1 : 5000",
  },
  {
    value: "10000",
    label: "1 : 10 000",
  },
  {
    value: "20000",
    label: "1 : 20 000",
  },
  {
    value: "40000",
    label: "1 : 40 000",
  },
  {
    value: "60000",
    label: "1 : 60 000",
  },
  {
    value: "100000",
    label: "1 : 100 000",
  },
  {
    value: "150000",
    label: "1 : 150 000",
  },
];

// export const prevRectCalc = (currentZoom, scale, rWidth, rHeight) => {
//   const scaleItem = scaleOptions.find((s) => s.value === scale);
//   const targetZoom = Number(scaleItem.zoom);
//   let newWidth;
//   let newHeight;

//   const maxZoom = 10;
//   const minZoom = 22;

//   if (currentZoom === targetZoom) {
//     newWidth = rWidth;
//     newHeight = rHeight;
//   }

//   if (currentZoom < targetZoom) {
//     const levelSteps = targetZoom - currentZoom;
//     newWidth = rWidth / levelSteps;
//     newHeight = rHeight / levelSteps;
//   }

//   if (currentZoom > targetZoom) {
//     const levelSteps = currentZoom - targetZoom;
//     newWidth = rWidth * levelSteps;
//     newHeight = rHeight * levelSteps;
//   }

//   return { pixelWidth: newWidth, pixelHeight: newHeight };
// };

function calculateBBox(centerX, centerY, pixelWidth, pixelHeight, dpi, scale) {
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

export const drawRectanglePrev = (
  routedMapRef,
  scale,
  orientation,
  handleStartPrint
) => {
  if (routedMapRef) {
    const map = routedMapRef.leafletMap.leafletElement;
    const latLngCenter = map.getCenter();
    const pointCenter = proj4("EPSG:4326", "EPSG:3857", [
      latLngCenter.lng,
      latLngCenter.lat,
    ]);

    const width = orientation === "landscape" ? 802 : 555;
    const height = orientation === "landscape" ? 555 : 802;

    const f = createFeatureFromBBox(
      calculateBBox(pointCenter[0], pointCenter[1], width, height, 72, scale)
    );

    const bb = bbox(f);
    const bounds = convertBBox2Bounds(bb, proj4crs3857def);
    const ul = proj4("EPSG:3857", "EPSG:4326", [bb[0], bb[1]]);
    const lr = proj4("EPSG:3857", "EPSG:4326", [bb[2], bb[3]]);

    const divUL = map.latLngToContainerPoint([ul[1], ul[0]]);
    const divLR = map.latLngToContainerPoint([lr[1], lr[0]]);

    drawRectFromWithBounds(map, bounds, handleStartPrint);
  }
};

const drawRectFromWithBounds = (map, bounds, handleStartPrint) => {
  const sw = bounds[0]; // Southwest
  const ne = bounds[1]; // Northeast
  const nw = [ne[0], sw[1]]; // Northwest
  const se = [sw[0], ne[1]]; // Southeast
  map.fitBounds(bounds);
  const rectangleCoordinates = [sw, nw, ne, se, sw];

  console.log("xxx rectangleCoordinates", rectangleCoordinates);
  console.log(
    "xxx nw",
    map.latLngToContainerPoint({
      lat: nw[0],
      lng: nw[1],
    })
  );

  const polygon = L.polygon(rectangleCoordinates, {
    color: "black",
    weight: 1,
    draggable: true,
  } as DraggablePolygonOptions) as CustomPolygon;

  polygon.addTo(map);
  polygon.prevPrintId = "print-rect-id";

  const prevDiv = document.getElementById("preview");

  if (!prevDiv) {
    createTooltipWrapper();
    const { northWest, northEast, southWest } = getPolygonPoints(map);

    if (northWest && northEast && southWest) {
      setPrevSizes(northWest, northEast, southWest);
    }
  } else {
    const { northWest, northEast, southWest } = getPolygonPoints(map);

    if (northWest && northEast && southWest) {
      setPrevSizes(northWest, northEast, southWest);
    }
  }

  polygon.on("dragend", () => {
    const newBounds = polygon.getBounds();
    map.fitBounds(newBounds);
  });

  polygon.on("dblclick", () => {
    handleStartPrint(map);
  });
};

export const deleteRectangleById = (map) => {
  map.eachLayer((layer) => {
    if (
      layer instanceof L.Polygon &&
      (layer as CustomPolygon).prevPrintId === "print-rect-id"
    ) {
      map.removeLayer(layer);
    }
  });
};

export const createTooltipWrapper = () => {
  const routedMap = document.getElementById("routedMap");

  if (routedMap) {
    const previewDiv = document.createElement("div");
    previewDiv.id = "preview";
    previewDiv.style.position = "absolute";
    previewDiv.style.zIndex = "1000";
    previewDiv.style.left = "0";
    previewDiv.style.top = "0";
    previewDiv.style.height = "0";
    // previewDiv.style.background = "transporent";
    previewDiv.style.pointerEvents = "none";
    previewDiv.style.opacity = "1";
    previewDiv.style.fontSize = "24px";
    previewDiv.textContent = "Tooltip text";
    routedMap.appendChild(previewDiv);
  }
};

export const setPrevSizes = (northWest, northEast, southWest) => {
  const prev = document.getElementById("preview");
  prev.style.top = northWest.y + "px";
  prev.style.left = northWest.x + "px";
  prev.style.width = northEast.x - northWest.x + "px";
  prev.style.height = southWest.y - northWest.y + "px";
};

const getPolygonByLeafletId = (map) => {
  let polygon;

  map.eachLayer(function (layer) {
    if (
      layer instanceof L.Polygon &&
      (layer as CustomPolygon).prevPrintId === "print-rect-id"
    ) {
      polygon = layer;
    }
  });
  return polygon;
};
export const getPolygonPoints = (map) => {
  const polygon = getPolygonByLeafletId(map);
  if (polygon) {
    const bounds = polygon.getBounds();

    const { _northEast, _southWest } = bounds;
    // const northEast = map.latLngToLayerPoint(_northEast);
    // const southWest = map.latLngToLayerPoint(_southWest);
    const northEast = map.latLngToContainerPoint(_northEast);
    const southWest = map.latLngToContainerPoint(_southWest);
    const northWest = {
      x: southWest.x,
      y: northEast.y,
    };
    const southEast = {
      x: northEast.x,
      y: southWest.y,
    };

    const points = {
      northEast,
      southWest,
      northWest,
      southEast,
    };

    console.log("xxx points", points);

    return points;
  } else {
    return {
      northEast: undefined,
      southWest: undefined,
      northWest: undefined,
      southEast: undefined,
    };
  }
};
