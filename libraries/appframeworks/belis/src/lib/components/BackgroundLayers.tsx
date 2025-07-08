import CismapLayer from "react-cismap/CismapLayer";

export const configuration = {
  trueOrtho: {
    title: "True Orthofoto",
    conf: {
      type: "wms",
      url: "https://geo.udsp.wuppertal.de/geoserver-cloud/ows",
      layers: "GIS-102:trueortho2024",
      // url: "https://maps.wuppertal.de/karten",
      // layers: "R102:trueortho2024",
      tileSize: 256,
      transparent: true,
      pane: "backgroundLayers",
      maxZoom: 26,
      format: "image/png",
    },
  },
  stadtplanGrau: {
    title: "True Orthofoto",
    conf: {
      type: "vector",
      style: "https://omt.map-hosting.de/styles/cismet-light/style.json",
      //   offlineAvailable: true,
      //   offlineDataStoreKey: "wuppBasemap",
      pane: "backgroundvectorLayers",
    },
  },
  stadtplan: {
    title: "Stadtplan (bunt)",
    conf: {
      type: "vector",
      style: "https://omt.map-hosting.de/styles/osm-bright-grey/style.json",
      //   offlineAvailable: true,
      //   offlineDataStoreKey: "wuppBasemap",
      pane: "backgroundvectorLayers",
    },
  },
};

export function BackgroundLayers({ activeBackgroundLayer, opacities = {} }) {
  //get the current configuration
  const currentConf = configuration[activeBackgroundLayer];
  //   if it is an array of configurations, render them all
  if (Array.isArray(currentConf.conf)) {
    return (
      <>
        {currentConf.conf.map((conf, index) => {
          let opacity = opacities[activeBackgroundLayer] || 1;
          if (conf.opacityFunction) {
            opacity = conf.opacityFunction(opacity);
          }
          return (
            <CismapLayer
              key={"CismapLayer." + activeBackgroundLayer + "." + index}
              {...{
                ...conf,
                opacity,
              }}
            ></CismapLayer>
          );
        })}
      </>
    );
  } else {
    //otherwise render the single configuration
    let opacity = opacities[activeBackgroundLayer] || 1;
    return (
      <CismapLayer
        key={"CismapLayer." + activeBackgroundLayer + "." + opacity}
        pane="backgroundLayers"
        {...{
          ...currentConf.conf,
          opacity,
        }}
      ></CismapLayer>
    );
  }
}
