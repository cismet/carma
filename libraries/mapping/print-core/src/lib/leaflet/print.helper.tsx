// Faithful copy of the geoportal `app/helper/print.tsx`. The ONLY changes vs.
// the app are the import paths, repointed to this folder's local siblings:
//   ../components/map-print/PrintButton      -> ./PrintButton
//   ../components/map-print/PrintPrevTexts   -> ./PrintPrevTexts
//   ../components/map-print/ClosePrintButton -> ./ClosePrintButton
//   ../config (convertLayerStringToLayers)   -> ./layerConfig
// gisHelper stays a local sibling (./gisHelper). No logic was changed.

import proj4 from "proj4";
import bbox from "@turf/bbox";
import {
  convertBBox2Bounds,
  getMeractorScale,
  proj4crs3857def,
} from "./gisHelper";
import * as L from "leaflet";
import { createRoot } from "react-dom/client";
import PrintButton from "./PrintButton";
import PrintPrevTexts from "./PrintPrevTexts";
import ClosePrintButton from "./ClosePrintButton";
import { convertLayerStringToLayers } from "./layerConfig";
import { buildInlineStylePrint } from "../core";
import {
  buildInlineVectorStyle,
  layerHasActiveFilter,
  type Bbox,
} from "../maplibre/inlineVectorPrint";
let reactRoot = null;
interface DraggablePolygonOptions extends L.PolylineOptions {
  draggable?: boolean;
  prevPrintId?: string;
}

interface CustomPolygon extends L.Polygon {
  prevPrintId?: string;
}
function getStyleName(vectorStyle) {
  if (!vectorStyle) {
    throw new Error("vectorStyle is undefined or null.");
  }

  if (!/^https?:\/\//.test(vectorStyle)) {
    return null;
  }

  // Extract the parts of the path
  const parts = vectorStyle.replace("https://", "").split("/");

  // Get the folder name and the file name without the extension
  const folderName = parts[parts.length - 2];
  const fileName = parts[parts.length - 1].split(".").slice(0, -1).join(".");

  // Determine style key
  let styleKey;
  if (fileName === "style") {
    styleKey = `${folderName}-style`;
  } else {
    styleKey = `${folderName}-${fileName}`;
  }

  // Replace non-JSON-friendly characters
  styleKey = styleKey.replace(/[^a-zA-Z0-9-]/g, "-");

  return styleKey;
}

// Fraction of the smaller viewport dimension kept as a margin ("buffer") of
// live map context around the print rectangle when fitting the map to it, so
// the rectangle never sits edge-to-edge with the viewport (the geoportal look
// was too tight at the top/center). Mirrors the MapLibre preview's
// PREVIEW_BUFFER_FRACTION (previewRect.ts). This only affects the map's
// zoom/pan; the rectangle's geographic coordinates — and therefore the print
// center and scale — are computed before fitBounds and stay untouched, so print
// precision is unchanged.
const PREVIEW_BUFFER_FRACTION = 0.1;

// Leaflet fitBounds padding (px per side) reproducing the buffer above from the
// map container size.
const getPreviewFitPadding = (map): L.PointExpression => {
  const size = map.getSize();
  const pad = Math.round(Math.min(size.x, size.y) * PREVIEW_BUFFER_FRACTION);
  return [pad, pad];
};

// Fit the map to the print rectangle, keeping the buffer above.
//
// The geoportal map uses zoomSnap: 1 (integer zoom only). With integer snapping,
// fitBounds + padding either does nothing (padding stays within the same zoom
// level) or jumps a WHOLE level (rectangle becomes ~half size) — there is no
// smooth "10% margin". To get the fractional zoom that yields a snug buffer
// (like the MapLibre preview), we drop zoomSnap to 0 for this one fit, then
// restore the map's own snapping so normal +/- interaction stays integer. Map
// zoom does not affect print precision — the print center/scale come from the
// rectangle's geographic bounds, not the map view.
export const fitPreviewBounds = (map, bounds, animate = true): void => {
  const prevSnap = map.options.zoomSnap;
  map.options.zoomSnap = 0;
  // The fractional target zoom is computed synchronously inside fitBounds, so
  // restoring zoomSnap right after does not disturb the (possibly animated)
  // transition toward it.
  map.fitBounds(bounds, { padding: getPreviewFitPadding(map), animate });
  map.options.zoomSnap = prevSnap;
};

const isIOS = () => {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.userAgent.includes("Mac") && "ontouchend" in document)
  );
};

function degToRad(degrees) {
  return degrees * (Math.PI / 180);
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
  const latLng = proj4("EPSG:3857", "EPSG:4326", center);
  const data = {
    layout: title,
    attributes: {
      keywordsAtt: ["map", "example", "metadata"],
      displayedScale: scale,
      map: {
        center,
        rotation: 0,
        longitudeFirst: true,
        layers,
        scale: getMeractorScale(scale, latLng[1]),
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

    if (!isIOS()) {
      window.open(urlBlob); // Open a new tab
    } else if (isIOS()) {
      // Download option
      const a = document.createElement("a");
      a.href = urlBlob;
      a.download = name;
      a.click();
    }

    // IFrame option
    // // Open a new tab and write the HTML content directly
    // const desiredFileName="DigiTalZwilling_PDF-Druck.pdf";
    // const newTab = window.open();
    // newTab.document.write(`
    //   <!DOCTYPE html>
    //   <html lang="de">
    //   <head>
    //     <meta charset="utf-8" />
    //     <title>DigiTal Zwilling PDF-Druck</title>
    //     <style>
    //       body { margin: 0; text-align: center; font-family: Arial, sans-serif; }
    //       iframe { width: 100%; height: 95vh; border: none; }
    //       .download-link {
    //           FONT-WEIGHT: 500;
    //           text-decoration: none;
    //           color: black;
    //           opacity: 0.7;
    //       }
    //     </style>
    //   </head>
    //   <body>
    //     <iframe src="${urlBlob}"></iframe>
    //     <div>
    //       <h1><a id="downloadLink" href="${urlBlob}" download="${desiredFileName}" class="download-link">
    //         ⬇️ PDF speichern
    //       </a>
    //       </h1>
    //     </div>
    //   </body>
    //   </html>
    // `);

    // // Close the document to ensure it's fully written
    // newTab.document.close();

    handleIsLoading(false);
  } catch (error: any) {
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

// `ctx` is optional so existing callers keep working unchanged. When it carries
// the live MapLibre maps + the print rectangle bbox, a vector layer that is
// actually filtered is printed as an inline geojson style (filtered features
// baked in, see inlineVectorPrint.ts) instead of the hosted, unfiltered style.
export const getPrintLayers = (
  bgLayer,
  layers,
  ctx?: {
    maplibreMaps?: Array<{ id: string; map: unknown }> | null;
    bbox?: Bbox | null;
  }
) => {
  const layerPrint = [];
  const bgLayers = convertLayerStringToLayers(
    bgLayer.layers,
    bgLayer.visible,
    bgLayer.opacity
  );
  const allLayers = [...bgLayers, ...layers];

  const findMaplibreMap = (id: string) =>
    ctx?.maplibreMaps?.find((entry) => entry.id === id)?.map ?? null;

  allLayers.forEach((layer) => {
    if (layer.visible) {
      switch (layer.layerType) {
        case "wms":
        case "wmts":
        case "wmts-nt":
          const url = layer.url || layer.props.url;
          const layers = layer.layers || layer.props.name;

          layerPrint.unshift(buildWMSPrint(url, layers, layer.opacity));
          break;

        case "vector":
          // Print the layer's live features as an inline geojson style when
          // either (a) it is actually filtered — the hosted style would
          // re-render ALL classes and lose the on-map filter — or (b) a feature
          // is selected/highlighted on it — the hosted style is stateless and
          // would drop the selection. buildInlineVectorStyle bakes both the
          // filter and the selection into a self-contained style and returns
          // null when there is nothing to inline (unfiltered + nothing
          // selected), so we fall through to the hosted-style path. Needs the
          // live MapLibre map (from ctx.maplibreMaps) and the print bbox.
          if (ctx?.bbox) {
            const liveMap = findMaplibreMap(layer.id);
            if (liveMap) {
              const inlineStyle = buildInlineVectorStyle(
                liveMap as never,
                layer,
                ctx.bbox,
                layerHasActiveFilter(layer)
              );
              if (inlineStyle) {
                layerPrint.unshift(
                  buildInlineStylePrint(inlineStyle, layer.opacity, 2, 1)
                );
                break;
              }
            }
          }

          // take the vector style and create a proper style name for the tgl4üromt service
          // use the folder name and add the style name like for /poi/style.json use poi-style
          // and for /poi/bildungseinrichtungen.style.json use poi-bildungseinrichtungen-style
          // Prefer the active printingStyle from layer.conf (kept in sync with
          // the current dynamic-styling option) over the plain vector style URL.
          const vectorStyle =
            (layer.conf?.printingStyle as string | undefined) ||
            layer.style ||
            layer.props.style;
          const styleName = getStyleName(vectorStyle);

          // Local (non-url) styles cannot be printed, so skip this layer.
          if (!styleName) {
            break;
          }

          layerPrint.unshift(
            buildVecorStylePrint(styleName, layer.opacity, 2, 1)
          );
          break;
        case "tiles":
          layerPrint.unshift(buildTilesPrint(layer.url, layer.opacity));
      }
    }
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

const buildVecorStylePrint = (
  vectorLayerName,
  opacity = 1,
  scalefactor = 1,
  sizefactor = 1
) => {
  return buildWMSPrint(
    `https://tsgl4printing-wms.cismet.de/tgl-wms/${scalefactor}x/${sizefactor}/`,
    vectorLayerName,
    opacity
  );
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

const buildTilesPrint = (url, opacity = 1) => {
  //replace the {z} {x} {y} with {TileMatrix} {TileCol} {TileRow} and put it to baseUrl
  // 3 replacements needed

  let baseURL = url.replace("{z}", "{TileMatrix}");
  baseURL = baseURL.replace("{x}", "{TileCol}");
  baseURL = baseURL.replace("{y}", "{TileRow}");

  const tiles = {
    baseURL,

    type: "WMTS",
    layer: "--can-be-ignored-since-it-is-already-in-the-baseURL--",
    style: "default",
    imageFormat: "image/png",
    opacity,
    matrixSet: "webmercator_hq",
    matrices: [
      {
        identifier: "00",
        scaleDenominator: 279541132.0143588,
        tileSize: [512, 512],
        topLeftCorner: [-20037508.342789244, 20037508.342789244],
        matrixSize: [1, 1],
      },
      {
        identifier: "01",
        scaleDenominator: 139770566.0071794,
        tileSize: [512, 512],
        topLeftCorner: [-20037508.342789244, 20037508.342789244],
        matrixSize: [2, 2],
      },
      {
        identifier: "02",
        scaleDenominator: 69885283.0035897,
        tileSize: [512, 512],
        topLeftCorner: [-20037508.342789244, 20037508.342789244],
        matrixSize: [4, 4],
      },
      {
        identifier: "03",
        scaleDenominator: 34942641.50179485,
        tileSize: [512, 512],
        topLeftCorner: [-20037508.342789244, 20037508.342789244],
        matrixSize: [8, 8],
      },
      {
        identifier: "04",
        scaleDenominator: 17471320.750897426,
        tileSize: [512, 512],
        topLeftCorner: [-20037508.342789244, 20037508.342789244],
        matrixSize: [16, 16],
      },
      {
        identifier: "05",
        scaleDenominator: 8735660.375448713,
        tileSize: [512, 512],
        topLeftCorner: [-20037508.342789244, 20037508.342789244],
        matrixSize: [32, 32],
      },
      {
        identifier: "06",
        scaleDenominator: 4367830.187724357,
        tileSize: [512, 512],
        topLeftCorner: [-20037508.342789244, 20037508.342789244],
        matrixSize: [64, 64],
      },
      {
        identifier: "07",
        scaleDenominator: 2183915.0938621783,
        tileSize: [512, 512],
        topLeftCorner: [-20037508.342789244, 20037508.342789244],
        matrixSize: [128, 128],
      },
      {
        identifier: "08",
        scaleDenominator: 1091957.5469310891,
        tileSize: [512, 512],
        topLeftCorner: [-20037508.342789244, 20037508.342789244],
        matrixSize: [256, 256],
      },
      {
        identifier: "09",
        scaleDenominator: 545978.7734655446,
        tileSize: [512, 512],
        topLeftCorner: [-20037508.342789244, 20037508.342789244],
        matrixSize: [512, 512],
      },
      {
        identifier: "10",
        scaleDenominator: 272989.3867327723,
        tileSize: [512, 512],
        topLeftCorner: [-20037508.342789244, 20037508.342789244],
        matrixSize: [1024, 1024],
      },
      {
        identifier: "11",
        scaleDenominator: 136494.69336638614,
        tileSize: [512, 512],
        topLeftCorner: [-20037508.342789244, 20037508.342789244],
        matrixSize: [2048, 2048],
      },
      {
        identifier: "12",
        scaleDenominator: 68247.34668319307,
        tileSize: [512, 512],
        topLeftCorner: [-20037508.342789244, 20037508.342789244],
        matrixSize: [4096, 4096],
      },
      {
        identifier: "13",
        scaleDenominator: 34123.673341596535,
        tileSize: [512, 512],
        topLeftCorner: [-20037508.342789244, 20037508.342789244],
        matrixSize: [8192, 8192],
      },
      {
        identifier: "14",
        scaleDenominator: 17061.836670798268,
        tileSize: [512, 512],
        topLeftCorner: [-20037508.342789244, 20037508.342789244],
        matrixSize: [16384, 16384],
      },
      {
        identifier: "15",
        scaleDenominator: 8530.918335399134,
        tileSize: [512, 512],
        topLeftCorner: [-20037508.342789244, 20037508.342789244],
        matrixSize: [32768, 32768],
      },
      {
        identifier: "16",
        scaleDenominator: 4265.459167699567,
        tileSize: [512, 512],
        topLeftCorner: [-20037508.342789244, 20037508.342789244],
        matrixSize: [65536, 65536],
      },
      {
        identifier: "17",
        scaleDenominator: 2132.7295838497835,
        tileSize: [512, 512],
        topLeftCorner: [-20037508.342789244, 20037508.342789244],
        matrixSize: [131072, 131072],
      },
      {
        identifier: "18",
        scaleDenominator: 1066.3647919248917,
        tileSize: [512, 512],
        topLeftCorner: [-20037508.342789244, 20037508.342789244],
        matrixSize: [262144, 262144],
      },
      {
        identifier: "19",
        scaleDenominator: 533.1823959624459,
        tileSize: [512, 512],
        topLeftCorner: [-20037508.342789244, 20037508.342789244],
        matrixSize: [524288, 524288],
      },
      {
        identifier: "20",
        scaleDenominator: 266.59119798122293,
        tileSize: [512, 512],
        topLeftCorner: [-20037508.342789244, 20037508.342789244],
        matrixSize: [1048576, 1048576],
      },
    ],
  };

  return tiles;
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
    label: "1 : 10.000",
  },
  {
    value: "20000",
    label: "1 : 20.000",
  },
  {
    value: "40000",
    label: "1 : 40.000",
  },
  {
    value: "60000",
    label: "1 : 60.000",
  },
  {
    value: "100000",
    label: "1 : 100.000",
  },
  {
    value: "150000",
    label: "1 : 150.000",
  },
];

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
  handleStartPrint,
  loading,
  dpi,
  handleClosePrint,
  handleRedraw
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

    drawRectFromWithBounds(
      map,
      bounds,
      handleStartPrint,
      loading,
      orientation,
      scale,
      dpi,
      handleClosePrint
      // handleRedraw
    );
  }
};

const drawRectFromWithBounds = (
  map,
  bounds,
  handleStartPrint,
  loading,
  orientation,
  scale,
  dpi,
  handleClosePrint
  // handleRedraw
) => {
  const sw = bounds[0]; // Southwest
  const ne = bounds[1]; // Northeast
  const nw = [ne[0], sw[1]]; // Northwest
  const se = [sw[0], ne[1]]; // Southeast
  map.fitBounds(bounds);
  const rectangleCoordinates = [sw, nw, ne, se, sw];

  const polygon = L.polygon(rectangleCoordinates, {
    color: "black",
    weight: 1,
    // fillOpacity: 0.3,
    draggable: true,
  } as DraggablePolygonOptions) as CustomPolygon;

  polygon.addTo(map);
  polygon.prevPrintId = "print-rect-id";
  addPreviewWrapper(
    map,
    handleStartPrint,
    loading,
    orientation,
    scale,
    dpi,
    false,
    handleClosePrint
    // handleRedraw
  );

  polygon.on("dragstart", () => {
    removePreviewWrapper();
  });
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

export const setPrevSizes = (
  northWest,
  northEast,
  southWest,
  map,
  handlerStartPrint,
  loading,
  orientation,
  scale,
  dpi,
  hideContent,
  handleClosePrint
  // handleRedraw
) => {
  removePreviewWrapper();
  // const previewDiv = document.getElementById("preview");
  createPreviewWrapperItems(
    northWest,
    northEast,
    southWest,
    map,
    handlerStartPrint,
    loading,
    orientation,
    scale,
    dpi,
    hideContent,
    handleClosePrint
    // handleRedraw
  );
};

export const getPolygonByLeafletId = (map) => {
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

const createPreviewWrapperItems = (
  northWest,
  northEast,
  southWest,
  map,
  handlerStartPrint,
  loading,
  orientation,
  scale,
  dpi,
  hideContent,
  handleClosePrint
  // handleRedraw
) => {
  const routedMap = document.getElementById("routedMap");

  const wrapWidth = northEast.x - northWest.x;
  const previewDiv = document.createElement("div");
  previewDiv.id = "preview";
  previewDiv.style.top = northWest.y + "px";
  previewDiv.style.left = northWest.x + "px";
  previewDiv.style.width = wrapWidth + "px";
  previewDiv.style.height = southWest.y - northWest.y + "px";
  previewDiv.style.fontSize =
    orientation === "portrait"
      ? getFontSizeForPortrait(wrapWidth)
      : getFontSizeForLandscape(wrapWidth);

  // const textOne = document.createElement("div");
  // textOne.id = "preview-tooltip-text";
  // textOne.className = "print-tooltip-text";
  // textOne.textContent = "Verschieben durch Ziehen mit Maus bzw. Finger";
  // previewDiv.appendChild(textOne);

  // const textTwo = document.createElement("div");
  // textTwo.id = "preview-tooltip-text";
  // textTwo.className = "print-tooltip-text";

  // const textThree = document.createElement("div");
  // textThree.className = "print-tooltip-text";
  // textThree.id = "preview-tooltip-text";

  // textThree.textContent = "Abbruch mit <esc>";
  // previewDiv.appendChild(textThree);

  const btn = document.createElement("div");
  btn.id = "btn-wrapper-print";
  // btn.style.pointerEvents = "auto";
  previewDiv.appendChild(btn);

  routedMap.appendChild(previewDiv);

  const { width, height, fontSize } =
    orientation === "portrait"
      ? getPrintBtnSizesPortrait(wrapWidth)
      : getPrintBtnSizesLandscape(wrapWidth);
  const isSmallMode =
    orientation === "portrait"
      ? getSmallSizePortrait(wrapWidth)
      : getSmallSizeLandscape(wrapWidth);
  reactRoot = createRoot(btn as HTMLElement);
  reactRoot.render(
    <>
      <ClosePrintButton
        closePrintMode={handleClosePrint}
        hide={hideContent}
        smallMode={isSmallMode}
      />
      <PrintPrevTexts
        scale={scale}
        dpi={dpi}
        format={orientation}
        hide={hideContent}
        smallMode={isSmallMode}
      />
      <div className="flex items-center justify-end gap-4">
        {/* <UpdateScalePrintButton
          // fontSize={fontSize}
          hide={hideContent}
          updateScaleHandler={() => console.log("xxx update")}
          smallMode={isSmallMode}
        /> */}
        <PrintButton
          // loading={loading}
          // width={width}
          // height={height}
          // fontSize={fontSize}
          hide={hideContent}
          smallMode={isSmallMode}
          map={{}}
        />
      </div>
    </>
  );
};

export const addPreviewWrapper = (
  map,
  handleStartPrint,
  loading,
  orientation,
  scale,
  dpi,
  hideContent = false,
  handleClosePrint
  // handleRedraw
) => {
  const { northWest, northEast, southWest } = getPolygonPoints(map);
  if (northWest && northEast && southWest) {
    setPrevSizes(
      northWest,
      northEast,
      southWest,
      map,
      handleStartPrint,
      loading,
      orientation,
      scale,
      dpi,
      hideContent,
      handleClosePrint
      // handleRedraw
    );
  }
};

export const removePreviewWrapper = () => {
  const wrapper = document.getElementById("preview");
  if (reactRoot) {
    reactRoot.unmount();
    reactRoot = null;
  }

  if (wrapper) {
    wrapper.remove();
  }
};

export const getFontSizeForPortrait = (width) => {
  switch (true) {
    case width >= 154 && width <= 278:
      return "16px";

    case width >= 103 && width < 154:
      return "10px";

    case width >= 80 && width < 103:
      return "7px";

    case width < 80:
      return "0px";

    default:
      return "24px";
  }
};

export const getFontSizeForLandscape = (width) => {
  switch (true) {
    case width >= 118 && width < 236:
      return "7px";

    case width >= 236 && width < 474:
      return "16px";

    case width >= 474:
      return "24px";

    case width <= 60:
      return "0px";

    default:
      return "0px";
  }
};

export const getPrintBtnSizesPortrait = (width) => {
  switch (true) {
    case width >= 102 && width <= 204:
      return {
        fontSize: "11px",
        width: "52px",
        height: "23px",
      };

    case width >= 81 && width <= 164:
      return {
        fontSize: "8px",
        width: "40px",
        height: "23px",
      };

    case width < 80:
      return {
        fontSize: "0px",
        width: "0px",
        height: "0px",
      };

    default:
      return {
        fontSize: "14px",
        width: "72px",
        height: "34px",
      };
  }
};

export const getPrintBtnSizesLandscape = (width) => {
  switch (true) {
    case width >= 112 && width <= 222:
      return {
        fontSize: "11px",
        width: "52px",
        height: "23px",
      };

    case width < 112:
      return {
        fontSize: "0px",
        width: "0px",
        height: "0px",
      };

    default:
      return {
        fontSize: "14px",
        width: "72px",
        height: "34px",
      };
  }
};

export const getSmallSizePortrait = (wrapWidth) => {
  return wrapWidth <= 154 ? true : false;
};

export const getSmallSizeLandscape = (wrapWidth) => {
  return wrapWidth <= 278 ? true : false;
};

// const getPreviewBounds = (
//   map,
//   bounds,
//   // orientation,
//   // scale,
//   // dpi,
// ) => {
//   const sw = bounds[0]; // Southwest
//   const ne = bounds[1]; // Northeast
//   const nw = [ne[0], sw[1]]; // Northwest
//   const se = [sw[0], ne[1]]; // Southeast
//   map.fitBounds(bounds);
//   const rectangleCoordinates = [sw, nw, ne, se, sw];

// return rectangleCoordinates

// const polygon = L.polygon(rectangleCoordinates, {
//   color: "black",
//   weight: 1,
//   // fillOpacity: 0.3,
//   draggable: true,
// } as DraggablePolygonOptions) as CustomPolygon;

// polygon.addTo(map);
// polygon.prevPrintId = "print-rect-id";
// addPreviewWrapper(
//   map,
//   handleStartPrint,
//   loading,
//   orientation,
//   scale,
//   dpi,
//   false,
//   handleClosePrint
//   // handleRedraw
// );

// polygon.on("dragstart", () => {
//   removePreviewWrapper();
// });
// polygon.on("dragend", () => {
//   const newBounds = polygon.getBounds();
//   map.fitBounds(newBounds);
// });

// polygon.on("dblclick", () => {
//   handleStartPrint(map);
// });
// };

export const getPreviewBounds = (
  map,
  scale,
  orientation,
  ifPrinted = false
) => {
  if (map) {
    if (!ifPrinted) {
      const latLngCenter = map.getCenter();
      const pointCenter = proj4("EPSG:4326", "EPSG:3857", [
        latLngCenter.lng,
        latLngCenter.lat,
      ]);

      const width = orientation === "landscape" ? 802 : 555;
      const height = orientation === "landscape" ? 555 : 802;

      const mercatorScale = getMeractorScale(scale, latLngCenter.lat);

      const f = createFeatureFromBBox(
        calculateBBox(
          pointCenter[0],
          pointCenter[1],
          width,
          height,
          72,
          mercatorScale
        )
      );

      const bb = bbox(f);
      const bounds = convertBBox2Bounds(bb, proj4crs3857def);

      const sw = bounds[0]; // Southwest
      const ne = bounds[1]; // Northeast
      const nw = [ne[0], sw[1]]; // Northwest
      const se = [sw[0], ne[1]]; // Southeast
      // Leave a buffer around the rectangle instead of fitting it edge-to-edge.
      fitPreviewBounds(map, bounds);
      const rectangleCoordinates = [sw, nw, ne, se, sw];

      return rectangleCoordinates;
    } else {
      const polygon = getPolygonByLeafletId(map);
      if (polygon) {
        const coordinates = polygon.getLatLngs();
        const flatCoordinates = coordinates.flat();
        deleteRectangleById(map);
        return flatCoordinates;
      } else {
        return undefined;
      }
    }
  }
  return undefined;
};

export const getCenterPrintPreview = (map) => {
  const prevPolygon = getPolygonByLeafletId(map);
  const bounds = prevPolygon.getBounds();
  const center = bounds.getCenter();
  const { lat, lng } = center;
  const polygonCenter = proj4("EPSG:4326", "EPSG:3857", [lng, lat]);

  return polygonCenter;
};

// WGS84 [west, south, east, north] bbox of the draggable print rectangle, used
// to clip which live features get inlined into the print (inlineVectorPrint.ts).
// Returns null when the print rectangle is not on the map.
export const getPreviewBboxWGS84 = (map): Bbox | null => {
  const polygon = getPolygonByLeafletId(map);
  if (!polygon) return null;
  const bounds = polygon.getBounds();
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  return [sw.lng, sw.lat, ne.lng, ne.lat];
};
