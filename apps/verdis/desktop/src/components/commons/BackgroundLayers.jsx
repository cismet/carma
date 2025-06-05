import CismapLayer from "react-cismap/CismapLayer";
import StyledWMSTileLayer from "react-cismap/StyledWMSTileLayer";
import MapLibreLayer from "react-cismap/vector/MapLibreLayer";
import { useDispatch } from "react-redux";
import { setActiveBackgroundLayer } from "../../store/slices/ui";

export const inIntranet = window.location.origin.includes("wuppertal-intra.de");

export const configuration = inIntranet
  ? {
      // trueOrtho2024: {
      //   title: "True Orthofoto 2024",
      //   conf: {
      //     type: "wms",
      //     url: "http://s10221:7098/orthofotos/services",
      //     layers: "WTO2024",
      //     version: "1.1.1",
      //     tileSize: 256,
      //     transparent: true,
      //     pane: "backgroundLayers",
      //     maxZoom: 26,
      //     format: "image/png",
      //   },
      // },
      trueOrtho2024slow: {
        title: "True Orthofoto 2024",
        conf: {
          type: "wms",
          url: "https://maps.wuppertal.de/karten",
          layers: "R102:trueortho2024",
          tileSize: 256,
          transparent: true,
          pane: "backgroundLayers",
          maxZoom: 26,
          format: "image/png",
        },
      },
      trueOrtho2024: {
        title: "True Orthofoto 2024",
        conf: {
          type: "wms",
          url: "https://geo.udsp.wuppertal.de/geoserver-cloud/ows",
          layers: "GIS-102:trueortho2024",

          tileSize: 256,
          transparent: true,
          pane: "backgroundLayers",
          maxZoom: 26,
          format: "image/png",
        },
      },
      ortho2024: {
        title: "Orthofoto 2024",
        conf: {
          type: "wms",
          url: "http://s10221:7098/orthofotos/services",
          layers: "WO2024",
          version: "1.1.1",
          tileSize: 256,
          transparent: true,
          pane: "backgroundLayers",
          maxZoom: 26,
          format: "image/png",
        },
      },
      trueOrtho2022: {
        title: "True Orthofoto 2022",
        conf: {
          type: "wms",
          url: "https://maps.wuppertal.de/deegree/wms",
          layers: "R102:trueortho2022",
          tileSize: 256,
          transparent: true,
          pane: "backgroundLayers",
          maxZoom: 26,
          format: "image/png",
        },
      },
      trueOrtho2021: {
        title: "True Orthofoto Land aktuell",
        conf: {
          type: "wms",
          url: "http://s10221.wuppertal-intra.de:7098/orthofotos/services",
          layers: "nw_dop_rgb",
          tileSize: 256,
          transparent: true,
          pane: "backgroundLayers",
          maxZoom: 26,
          format: "image/png",
        },
      },
      ortho2020: {
        title: "True Orthofoto 2020",
        conf: {
          type: "wms",
          url: "http://s102w284.stadt.wuppertal-intra.de:6080/arcgis/services/PRODUKTION/AGS_ORTHOPHOTO_WUP20_D/MapServer/WMSServer",
          layers: "4",
          tileSize: 256,
          transparent: true,
          pane: "backgroundLayers",
          maxZoom: 26,
          format: "image/png",
        },
      },
      // ortho2024: {},
      ortho2022: {
        title: "Orthofoto 2022",
        conf: {
          type: "wms",
          url: "http://s10221:7098/orthofotos/services",
          layers: "WO2022",
          version: "1.1.1",
          tileSize: 256,
          transparent: true,
          pane: "backgroundLayers",
          maxZoom: 26,
          format: "image/png",
        },
      },
    }
  : {
      trueOrtho2024slow: {
        title: "True Orthofoto 2024",
        conf: {
          type: "wms",
          url: "https://maps.wuppertal.de/karten",
          layers: "R102:trueortho2024",
          tileSize: 256,
          transparent: true,
          pane: "backgroundLayers",
          maxZoom: 26,
          format: "image/png",
        },
      },
      trueOrtho2024: {
        title: "True Orthofoto 2024",
        conf: {
          type: "wms",
          url: "https://geo.udsp.wuppertal.de/geoserver-cloud/ows",
          layers: "GIS-102:trueortho2024",

          tileSize: 256,
          transparent: true,
          pane: "backgroundLayers",
          maxZoom: 26,
          format: "image/png",
        },
      },
      ortho2024: {
        title: "Orthofoto 2024",
        conf: {
          type: "wms",
          url: "https://maps.wuppertal.de/karten",
          layers: "R102:luftbild2024",
          tileSize: 256,
          transparent: true,
          pane: "backgroundLayers",
          maxZoom: 26,
          format: "image/png",
        },
      },
      trueOrtho2022: {
        title: "True Orthofoto 2022",
        conf: {
          type: "wms",
          url: "https://maps.wuppertal.de/deegree/wms",
          layers: "R102:trueortho2022",
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
            url: "https://maps.wuppertal.de/deegree/wms",
            layers: "R102:trueortho2022",
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

function getFirstKey(o) {
  const keys = Object.keys(o);
  return keys.length > 0 ? keys[0] : undefined;
}

export default function BackgroundLayers({
  activeBackgroundLayer,
  opacities = {},
}) {
  const dispatch = useDispatch();
  //get the current configuration
  let currentConf = configuration[activeBackgroundLayer];

  if (!currentConf || !activeBackgroundLayer) {
    const lastKey = getFirstKey(configuration);
    currentConf = configuration[lastKey];
    dispatch(setActiveBackgroundLayer(lastKey));
  }

  //   if it is an array of configurations, render them all
  if (Array.isArray(currentConf?.conf)) {
    return (
      <>
        {currentConf?.conf.map((conf, index) => {
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
        {...{
          ...currentConf?.conf,
          opacity,
        }}
      ></CismapLayer>
    );
  }
}
