import CismapLayer from 'react-cismap/CismapLayer';
import objectAssign from 'object-assign';
import type { DefaultLayerConfig, LayerConfig, NamedStyles } from '../types';

interface backgroundLayersProps {
  layerString: string;
  namedMapStyle?: string;
  config?: any;
  layerConfig?: LayerConfig;
  defaultLayerConfig: DefaultLayerConfig;
  namedStylesConfig: NamedStyles;
}

export function getBackgroundLayers({
  layerString,
  namedMapStyle = 'default',
  config = {
    layerSeparator: '|',
  },
  layerConfig,
  defaultLayerConfig,
  namedStylesConfig,
}: backgroundLayersProps) {
  const layerArr = (layerString || '').split(config.layerSeparator || '|');
  let namedMapStyleExtension = namedMapStyle;
  if (namedMapStyleExtension === null || namedMapStyleExtension === '') {
    namedMapStyleExtension = 'default';
  }
  namedMapStyleExtension = '.' + namedMapStyleExtension;
  const getLayer = (layerWithNamedStyleExtension, options = {}) => {
    const layerAndNamedStyleArray = layerWithNamedStyleExtension.split('.');
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
    const layerGetter = createLayerFactoryFunction(
      layerAndNamedStyleArray[0],
      layerConfig,
      defaultLayerConfig,
    );
    if (layerGetter) {
      return layerGetter(mergedOptions);
    } else {
      return null;
    }
  };

  return (
    <div key={'layer.' + layerString}>
      {layerArr.map((layerWithOptions) => {
        const layOp = layerWithOptions.split('@');
        if (!isNaN(parseInt(layOp[1], 10))) {
          const layerWithNamedStyleExtension =
            layOp[0] + namedMapStyleExtension;

          const layerOptions = {
            opacity: parseInt(layOp[1] || '100', 10) / 100.0,
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
              'Problems during parsing of the layer options. Skip options. You will get the 100% Layer:' +
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

const createLayerFactoryFunction = (
  key: string,
  _conf: LayerConfig | undefined,
  defaultConf: DefaultLayerConfig,
) => {

  if (_conf === undefined) {
    console.warn(
      "No LayerConfig given. Please provide a LayerConfig to get the layer factory function.",
    );
    return null;
  }

  let conf = {
    namedStyles: defaultConf.namedStyles,
    defaults: defaultConf.defaults,
    ..._conf,
  };


  switch ((conf.namedLayers[key] || {}).type) {
    case 'wms':
    case 'wmts':
      return (options) => {
        let params = { ...conf.defaults.wms, ...conf.namedLayers[key] };
        return (
          <CismapLayer
            key={key + JSON.stringify(options)}
            {...params}
            opacity={options.opacity}
            cssFilter={options['css-filter']}
            type="wmts"
          />
        );
      };
    case 'wms-nt':
    case 'wmts-nt':
      return (options) => {
        let params = { ...conf.defaults.wms, ...conf.namedLayers[key] };
        return (
          <CismapLayer
            key={key + JSON.stringify(options)}
            {...params}
            opacity={options.opacity}
            type="wmts-nt"
          />
        );
      };
    case 'tiles':
      return (options) => {
        let params = { ...conf.defaults.wms, ...conf.namedLayers[key] };

        return (
          <CismapLayer
            key={key + JSON.stringify(options)}
            {...params}
            opacity={options.opacity}
            cssFilter={options['css-filter']}
            type="tiles"
          />
        );
      };
    case 'vector':
      return (options) => {
        let params = { ...conf.defaults.vector, ...conf.namedLayers[key] };

        return (
          <CismapLayer
            keyIn={key + JSON.stringify(options)}
            {...params}
            opacity={options.opacity}
            type="vector"
          />
        );
      };
  }
};
