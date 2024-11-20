export const printMap = async () => {
  const url = "https://mapfish.cismet.de/print/A4_Landscape/buildreport.pdf";

  const data = {
    layout: "A4 landscape",
    attributes: {
      keywordsAtt: ["map", "example", "metadata"],
      map: {
        center: [801491.21, 6669650.55],
        rotation: 0,
        longitudeFirst: true,
        layers: [
          {
            baseURL: "https://tgl.cismet.de/styles/poi-style/256",
            type: "OSM",
            imageExtension: "png",
            tileMatrixSet: "zxy",
          },
          {
            imageFormat: "image/png",
            baseURL: "https://geodaten.metropoleruhr.de/spw2/service",
            customParams: {
              EXCEPTIONS: "INIMAGE",
              TRANSPARENT: "true",
            },
            layers: ["spw2_light"],
            type: "WMS",
            version: "1.3.0",
          },
        ],
        scale: 4000,
        projection: "EPSG:3857",
        dpi: 300,
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
    a.download = "debug.pdf";
    a.click();

    URL.revokeObjectURL(urlBlob);
  } catch (error) {
    console.log("xxx res", error);
  }
};
