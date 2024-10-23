import CismapLayer from 'react-cismap/CismapLayer';
import StyledWMSTileLayer from 'react-cismap/StyledWMSTileLayer';
import MapLibreLayer from 'react-cismap/vector/MapLibreLayer';

export const configuration = {
  trueOrtho2022: {
    title: 'True Orthofoto 2022',
    conf: {
      type: 'wms',
      url: 'https://maps.wuppertal.de/deegree/wms',
      layers: 'R102:trueortho2022',
      tileSize: 256,
      transparent: true,
      pane: 'backgroundLayers',
      maxZoom: 26,
      format: 'image/png',
    },
  },
  trueOrtho2021: {
    title: 'True Orthofoto 2021 (Land)',
    conf: {
      type: 'wms',
      url: 'http://s10221.wuppertal-intra.de:7098/orthofotos/services',
      layers: 'nw_dop_rgb',
      tileSize: 256,
      transparent: true,
      pane: 'backgroundLayers',
      maxZoom: 26,
      format: 'image/png',
    },
  },
  ortho2020: {
    title: 'Orthofoto 2020',
    conf: {
      type: 'wms',
      url: 'http://s102w284.stadt.wuppertal-intra.de:6080/arcgis/services/PRODUKTION/AGS_ORTHOPHOTO_WUP20_D/MapServer/WMSServer',
      layers: '4',
      tileSize: 256,
      transparent: true,
      pane: 'backgroundLayers',
      maxZoom: 26,
      format: 'image/png',
    },
  },
  ortho2018: {
    title: 'Orthofoto 2018',
    conf: {
      type: 'wms',
      url: 'http://s102w284.stadt.wuppertal-intra.de:6080/arcgis/services/PRODUKTION/AGS_ORTHOPHOTO_WUP/MapServer/WMSServer',
      layers: '13',
      tileSize: 256,
      transparent: true,
      pane: 'backgroundLayers',
      maxZoom: 26,
      format: 'image/png',
    },
  },
  ortho2016: {
    title: 'Orthofoto 2016',
    conf: {
      type: 'wms',
      url: 'http://s102w284.stadt.wuppertal-intra.de:6080/arcgis/services/PRODUKTION/AGS_ORTHOPHOTO_WUP/MapServer/WMSServer',
      layers: '9',
      tileSize: 256,
      transparent: true,
      pane: 'backgroundLayers',
      maxZoom: 26,
      format: 'image/png',
    },
  },

  lbk: {
    title: 'Luftbildkarte',
    conf: [
      {
        type: 'wmts',
        url: 'https://geodaten.metropoleruhr.de/spw2/service',
        layers: 'spw2_light_grundriss',
        version: '1.3.0',
        pane: 'backgroundvectorLayers',
        transparent: true,
        format: 'image/png',
        maxZoom: 26,

        tiled: false,
      },
      {
        type: 'wms',
        url: 'https://maps.wuppertal.de/deegree/wms',
        layers: 'R102:trueortho2022',
        tileSize: 256,
        transparent: true,
        pane: 'backgroundLayers',
        maxZoom: 26,
        opacityFunction: (opacity) => opacity * 0.75,
        format: 'image/png',
      },
      {
        type: 'wmts',
        url: 'https://geodaten.metropoleruhr.de/dop/dop_overlay?language=ger',
        layers: 'dop_overlay',
        version: '1.3.0',
        tiled: false,
        format: 'image/png',
        transparent: true,
        maxZoom: 26,
        pane: 'additionalLayers0',
      },
    ],
  },

  stadtplan: {
    title: 'Stadtplan (bunt)',
    conf: {
      type: 'vector',
      style: 'https://omt.map-hosting.de/styles/osm-bright-grey/style.json',
      //   offlineAvailable: true,
      //   offlineDataStoreKey: "wuppBasemap",
      pane: 'backgroundvectorLayers',
    },
  },
};

export default function BackgroundLayers({
  activeBackgroundLayer,
  opacities = {},
}) {
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
              key={'CismapLayer.' + activeBackgroundLayer + '.' + index}
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
        key={'CismapLayer.' + activeBackgroundLayer + '.' + opacity}
        {...{
          ...currentConf.conf,
          opacity,
        }}
      ></CismapLayer>
    );
  }
}
