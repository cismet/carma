export const printMap = async (
  center,
  scale,
  layers,
  orientation,
  dpi,
  name,
  handleIsLoading
) => {
  console.log("xxx scale", scale);
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
    zoom: "22",
  },
  {
    value: "500",
    label: "1 : 500",
    zoom: "21",
  },
  {
    value: "1000",
    label: "1 : 1000",
    zoom: "20",
  },
  {
    value: "2500",
    label: "1 : 2500",
    zoom: "19",
  },
  {
    value: "5000",
    label: "1 : 5000",
    zoom: "18",
  },
  {
    value: "10000",
    label: "1 : 10 000",
    zoom: "17",
  },
  {
    value: "20000",
    label: "1 : 20 000",
    zoom: "16",
  },
  {
    value: "40000",
    label: "1 : 40 000",
    zoom: "15",
  },
  {
    value: "60000",
    label: "1 : 60 000",
    zoom: "14",
  },
  {
    value: "100000",
    label: "1 : 100 000",
    zoom: "13",
  },
  {
    value: "250000",
    label: "1 : 250 000",
    zoom: "12",
  },
  {
    value: "500000",
    label: "1 : 500 000",
    zoom: "11",
  },
  {
    value: "1000000",
    label: "1 : 1 000 000",
    zoom: "10",
  },
];

export const prevRectCalc = (currentZoom, scale, rWidth, rHeight) => {
  const scaleItem = scaleOptions.find((s) => s.value === scale);
  const targetZoom = Number(scaleItem.zoom);
  let newWidth;
  let newHeight;

  if (currentZoom === targetZoom) {
    newWidth = rWidth;
    newHeight = rHeight;
  }

  if (currentZoom < targetZoom) {
    const levelSteps = targetZoom - currentZoom;
    newWidth = rWidth / levelSteps;
    newHeight = rHeight / levelSteps;
  }

  if (currentZoom > targetZoom) {
    const levelSteps = targetZoom - currentZoom;
    newWidth = rWidth * levelSteps;
    newHeight = rHeight * levelSteps;
  }

  console.log("xxx pixelWidth", {
    pixelWidth: newWidth,
    pixelHeight: newHeight,
  });

  return { pixelWidth: newWidth, pixelHeight: newHeight };
};
