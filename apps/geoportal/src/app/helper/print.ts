export const printMap = async (
  center,
  scale,
  layers,
  orientation,
  dpi,
  name
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
  } catch (error) {
    console.log("xxx res", error);
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

      layerPrint.push(buildWMSPrint(baseURL, name));
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

const buildWMSPrint = (baseURL, name) => {
  const wms = {
    imageFormat: "image/png",
    baseURL: baseURL,
    customParams: {
      EXCEPTIONS: "INIMAGE",
      TRANSPARENT: "true",
    },
    layers: [name],
    type: "WMS",
    version: "1.3.0",
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
  console.log(
    "xxx orintation",
    orientation === "portrait" ? portrait : landscape
  );

  return {
    url: orientation === "portrait" ? portrait : landscape,
    title: orientation === "portrait" ? "A4 portrait" : "A4 landscape",
  };
};
