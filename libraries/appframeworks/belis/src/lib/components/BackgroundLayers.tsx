import CismapLayer from "react-cismap/CismapLayer";

export const backgroundLayerConfigurations = {
  liegenschaftskarteGrau: {
    title: "Liegenschaftskarte (grau)",
    conf: {
      type: "wmts",
      url: "http://s10221.wuppertal-intra.de:7098/alkis/services",
      layers: "alkomgw",
      styles: "default",
      version: "1.1.1",
      tileSize: 256,
      maxZoom: 26,

      transparent: true,
      format: "image/png",
    },
  },
  liegenschaftskarteBunt: {
    title: "Liegenschaftskarte (bunt)",
    conf: {
      type: "wmts",
      url: "http://s10221.wuppertal-intra.de:7098/alkis/services",
      layers: "alkomf",
      styles: "default",
      version: "1.1.1",
      tileSize: 256,
      transparent: true,
      format: "image/png",
    },
  },
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
  lbk: {
    title: "Luftbildkarte",
    conf: [
      {
        type: "wmts",
        url: "https://geodaten.metropoleruhr.de/spw2/service",
        layers: "spw2_light_grundriss",
        version: "1.3.0",
        pane: "backgroundvectorLayers",
        transparent: true,
        format: "image/png",
        maxZoom: 26,

        tiled: false,
      },
      {
        type: "wms",
        url: "https://geo.udsp.wuppertal.de/geoserver-cloud/ows",
        layers: "GIS-102:trueortho2024",
        // url: "https://maps.wuppertal.de/karten",
        // layers: "R102:trueortho2024",
        tileSize: 256,
        transparent: true,
        pane: "backgroundLayers",
        maxZoom: 26,
        opacityFunction: (opacity) => opacity * 0.75,
        format: "image/png",
      },
      {
        type: "wmts",
        url: "https://geodaten.metropoleruhr.de/dop/dop_overlay?language=ger",
        layers: "dop_overlay",
        version: "1.3.0",
        tiled: false,
        format: "image/png",
        transparent: true,
        maxZoom: 26,
        pane: "additionalLayers0",
      },
    ],
  },
  stadtplanGrau: {
    title: "Stadtplan (grau)",
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
  const currentConf = backgroundLayerConfigurations[activeBackgroundLayer];
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
