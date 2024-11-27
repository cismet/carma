export const printMap = async (
  center,
  scale,
  layers,
  orientation,
  dpi,
  name,
  handleIsLoading
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
    const blob = await response.blob();
    const urlBlob = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = urlBlob;
    a.download = name;
    a.click();

    URL.revokeObjectURL(urlBlob);
    handleIsLoading(false);
  } catch (error) {
    console.log("xxx res", error);
    handleIsLoading(false);
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

    if (layer.layerType === "vector") {
      layerPrint.unshift(
        buildOMSPrint("https://tgl.cismet.de/styles/poi-style/256")
      );
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
    // version: "1.3.0",
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
    value: "250000",
    label: "1 : 250 000",
  },
  // {
  //   value: "600000",
  //   label: "1 : 600 000",
  // },
  {
    value: "400000",
    label: "1 : 400 000",
  },
];

export const prevRectCalc = (currentZoom, scale, rWidth, rHeight) => {
  const scaleItem = scaleOptions.find((s) => s.value === scale);
  const targetZoom = Number(scaleItem.zoom);
  let newWidth;
  let newHeight;

  const maxZoom = 10;
  const minZoom = 22;

  if (currentZoom === targetZoom) {
    newWidth = rWidth;
    newHeight = rHeight;
  }

  // if(currentZoom === targetZoom && targetZoom !== maxZoom){
  //   if()
  // }

  if (currentZoom < targetZoom) {
    const levelSteps = targetZoom - currentZoom;
    newWidth = rWidth / levelSteps;
    newHeight = rHeight / levelSteps;
  }

  if (currentZoom > targetZoom) {
    const levelSteps = currentZoom - targetZoom;
    newWidth = rWidth * levelSteps;
    newHeight = rHeight * levelSteps;
  }

  return { pixelWidth: newWidth, pixelHeight: newHeight };
};

export const calculateBBox = (
  centerX,
  centerY,
  pixelWidth,
  pixelHeight,
  dpi,
  scale
) => {
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
};

export const drawRectangleFromBbox = (map, bbox) => {
  const corner1 = map.options.crs.unproject(L.point(bbox.minX, bbox.minY)); // Bottom-left
  const corner2 = map.options.crs.unproject(L.point(bbox.minX, bbox.maxY)); // Top-left
  const corner3 = map.options.crs.unproject(L.point(bbox.maxX, bbox.maxY)); // Top-right
  const corner4 = map.options.crs.unproject(L.point(bbox.maxX, bbox.minY)); // Bottom-right

  const polygon = L.polygon(
    [
      [corner1.lat, corner1.lng],
      [corner2.lat, corner2.lng],
      [corner3.lat, corner3.lng],
      [corner4.lat, corner4.lng],
      [corner1.lat, corner1.lng],
    ],
    {
      color: "black",
      weight: 1,
    }
  ).addTo(map);

  polygon.prevPrintId = "print-rect-id";
};

export const deleteRectangleById = (map) => {
  map.eachLayer((layer) => {
    if (layer instanceof L.Polygon && layer.prevPrintId === "print-rect-id") {
      map.removeLayer(layer);
    }
  });
};
