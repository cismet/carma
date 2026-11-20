import objectAssign from "object-assign";
import React from "react";
// import NonTiledWMSLayer from "../NonTiledWMSLayer";
// import StyledTileLayer from "../StyledTileLayer";
// import StyledWMSTileLayer from "../StyledWMSTileLayer";
// import MapLibreLayer from "../vector/MapLibreLayer";
import StyledWMSTileLayer from "react-cismap/StyledWMSTileLayer";
import StyledTileLayer from "react-cismap/StyledTileLayer";
import MapLibreLayer from "react-cismap/vector/MapLibreLayer";
import NonTiledWMSLayer from "react-cismap/NonTiledWMSLayer";
import { namedLayers } from "@carma-mapping/utils";

const namedStyles = {
  default: { opacity: 0.6 },
  night: {
    opacity: 0.9,
    "css-filter": "filter:grayscale(0.9)brightness(0.9)invert(1)",
  },
  blue: {
    opacity: 1.0,
    "css-filter":
      "filter:sepia(0.5) hue-rotate(155deg) contrast(0.9) opacity(0.9) invert(0)",
  },
};

export default function getLayers(
  layerString: string,
  mainOpacity = 1,
  namedMapStyle = "default",
  config: { layerSeparator?: string } = {
    layerSeparator: "|",
  },
  layerConfig?: typeof defaultLayerConf
) {
  let namedStylesConfig = namedStyles;
  const layerArr = (layerString || "").split(config.layerSeparator || "|");
  let namedMapStyleExtension = namedMapStyle;
  if (namedMapStyleExtension === null || namedMapStyleExtension === "") {
    namedMapStyleExtension = "default";
  }
  namedMapStyleExtension = "." + namedMapStyleExtension;
  const getLayer = (layerWithNamedStyleExtension, options = {}) => {
    const layerAndNamedStyleArray = layerWithNamedStyleExtension.split(".");
    let namedStyleOptions = {};

    if (layerAndNamedStyleArray.length > 1) {
      //the last named style is overriding the ones before
      let first = true;
      for (const element of layerAndNamedStyleArray) {
        if (first) {
          first = false;
        } else {
          namedStyleOptions = objectAssign(
            {},
            namedStyleOptions,
            namedStylesConfig[element]
          );
        }
      }
    }
    let mergedOptions = objectAssign({}, namedStyleOptions, options);
    // const layerGetter = Layers.get(layerAndNamedStyleArray[0]);
    const layerGetter = createLayerFactoryFunction(
      layerAndNamedStyleArray[0],
      layerConfig
    );
    if (layerGetter) {
      return layerGetter(mergedOptions);
    } else {
      return null;
    }
  };

  return (
    <div key={"layer." + layerString}>
      {layerArr.map((layerWithOptions) => {
        const layOp = layerWithOptions.split("@");
        if (!isNaN(parseInt(layOp[1], 10))) {
          const layerWithNamedStyleExtension =
            layOp[0] + namedMapStyleExtension;

          const layerOptions = {
            opacity: (parseInt(layOp[1] || "100", 10) / 100.0) * mainOpacity,
          };
          return getLayer(layerWithNamedStyleExtension, layerOptions);
        }
        if (layOp.length === 2) {
          try {
            let layerOptions = JSON.parse(layOp[1]);
            let layerWithNamedStyleExtension =
              layOp[0] + namedMapStyleExtension;
            return getLayer(layerWithNamedStyleExtension, layerOptions);
          } catch (error) {
            console.error(error);
            console.error(
              "Problems during parsing of the layer options. Skip options. You will get the 100% Layer:" +
                layOp[0]
            );
            const layerWithNamedStyleExtension =
              layOp[0] + namedMapStyleExtension;
            return getLayer(layerWithNamedStyleExtension);
          }
        } else {
          const layerWithNamedStyleExtension =
            layOp[0] + namedMapStyleExtension;
          return getLayer(layerWithNamedStyleExtension);
        }
      })}
    </div>
  );
}

const createLayerFactoryFunction = (key, _conf = defaultLayerConf) => {
  let conf = {
    namedStyles: defaultLayerConf.namedStyles,
    defaults: defaultLayerConf.defaults,
    ..._conf,
  };

  switch ((conf.namedLayers[key] || {}).type) {
    case "empty":
      return () => {
        return null;
      };
    case "wms":
    case "wmts":
      return (options) => {
        let params = { ...conf.defaults.wms, ...conf.namedLayers[key] };
        // console.log('params for ' + key, params);
        return (
          <StyledWMSTileLayer
            key={key + JSON.stringify(options)}
            {...params}
            opacity={options.opacity}
            cssFilter={options["css-filter"]}
          />
        );
      };
    case "wms-nt":
    case "wmts-nt":
      return (options) => {
        let params = { ...conf.defaults.wms, ...conf.namedLayers[key] };
        // console.log('params for ' + key, params);
        return (
          <NonTiledWMSLayer
            key={key + JSON.stringify(options)}
            {...params}
            type={params.type.replace("-nt", "")}
            opacity={options.opacity}
          />
        );
      };
    case "tiles":
      return (options) => {
        let params = { ...conf.defaults.wms, ...conf.namedLayers[key] };
        // console.log("params for " + key, params);

        return (
          <StyledTileLayer
            key={key + JSON.stringify(options)}
            {...params}
            opacity={options.opacity}
            cssFilter={options["css-filter"]}
          />
        );
      };
    case "vector":
      return (options) => {
        // let params = { ...conf.defaults.vector, ...conf.namedLayers[key], ...options }; // the way it should be to tarnsport e.g. opacity
        let params = { ...conf.defaults.vector, ...conf.namedLayers[key] };
        // console.log("params for " + key, params);

        return (
          <MapLibreLayer
            keyIn={key + JSON.stringify(options)}
            {...params}
            opacity={options.opacity}

            // cssFilter={options["css-filter"]}
          />
        );
      };
  }
  //just in case
  return null;
};

export const defaultLayerConf = {
  namedStyles: {
    default: { opacity: 0.6 },
    night: {
      opacity: 0.9,
      "css-filter": "filter:grayscale(0.9)brightness(0.9)invert(1)",
    },
    blue: {
      opacity: 1.0,
      "css-filter":
        "filter:sepia(0.5) hue-rotate(155deg) contrast(0.9) opacity(0.9) invert(0)",
    },
  },
  defaults: {
    wms: {
      format: "image/png",
      tiled: "true",
      maxZoom: 22,
      opacity: 0.6,
      version: "1.1.1",
      pane: "backgroundLayers",
    },
    vector: {},
  },
  namedLayers,
};
