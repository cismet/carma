import { Layer, WMSCapabilitiesJSON } from 'wms-capabilities';
import { serviceConfig } from './config';
import { Item, XMLLayer } from './types';

export const flattenLayer = (
  layer: any,
  parentTitles: any = [],
  url: string
) => {
  const layerTitle = layer.Title;
  const layerTags = [...parentTitles, layerTitle];

  const flattenedLayer: any = {
    Title: layerTitle,
    Name: layer.Name ? layer.Name : '',
    Abstract: layer.Abstract,
    tags: layerTags,
    srs: layer.SRS,
    BoundingBox: layer.BoundingBox,
    LatLonBoundingBox: layer.LatLonBoundingBox,
    style: layer.Style,
    noSubsets: layer.noSubsets,
    opaque: layer.opaque,
    queryable: layer.queryable,
    url,
  };

  if (layer.Layer) {
    const childLayers: any[] = [];
    layer.Layer.forEach((subLayer: any) => {
      const flattennedSubLayer = flattenLayer(subLayer, layerTags, url);
      if (flattennedSubLayer?.layers) {
        childLayers.push(...flattennedSubLayer.layers);
        delete flattennedSubLayer.layers;
      }
      if (flattennedSubLayer.Name !== '') {
        childLayers.push(flattennedSubLayer);
      }
    });
    flattenedLayer.layers = childLayers;
  }

  return flattenedLayer;
};

export const createBaseConfig = (layers) => {
  const result = {};
  layers.forEach((item) => {
    result[item.Title] = {
      layers: item.layers.map((layer) => ({ name: layer.Name })),
    };
  });
  console.log(result);

  return null;
};

const getLeafLayers = (layer, leafLayers = []) => {
  // Check if the layer has sub-layers
  if (layer.Layer && Array.isArray(layer.Layer) && layer.Layer.length > 0) {
    // Recursively check each sub-layer
    layer.Layer.forEach((subLayer) => getLeafLayers(subLayer, leafLayers));
  } else {
    // If no sub-layers, it's a leaf layer, add it to the list
    // @ts-ignore
    leafLayers.push(layer);
  }
  return leafLayers;
};

export const getAllLeafLayers = (capabilities) => {
  const rootLayer = capabilities.Capability.Layer;
  return getLeafLayers(rootLayer);
};

export const findDifferences = (array1, array2) => {
  const missingInConfig = array1.filter(
    (layer1) => !array2.some((layer2) => layer2.name === layer1.Name)
  );

  return {
    missingInConfig,
  };
};

const wmsLayerToGenericItem = (layer: XMLLayer, serviceName: string) => {
  let item: Item = {
    title: layer.Title,
    description: layer.Abstract,
    tags: layer.tags,
    id: serviceName + ':' + layer.Name,
    name: layer.Name,
    type: 'layer',
    layerType: 'wmts',
    props: { ...layer },
  };

  return item;
};

export const getLayerStructure = ({
  config,
  wms,
  serviceName,
}: {
  config: any;
  wms?: WMSCapabilitiesJSON;
  serviceName: string;
}) => {
  const structure: any[] = [];
  const services = serviceConfig;
  for (let category in config) {
    const categoryConfig = config[category];
    const layers: Item[] = [];
    let categoryObject = {
      Title: categoryConfig.Title || category,
      layers,
    };

    for (let layerIndex in categoryConfig.layers) {
      const layer = categoryConfig.layers[layerIndex];
      let service;
      if (layer.serviceName) {
        service = services[layer.serviceName];
      } else {
        service = services[categoryConfig.serviceName];
      }
      if (service.name === serviceName) {
        let foundLayer: Item;
        if (wms) {
          const wmsLayer = findLayerAndAddTags(
            wms.Capability.Layer,
            layer.name,
            []
          );
          foundLayer = wmsLayerToGenericItem(wmsLayer, serviceName);
        } else {
          foundLayer = layer;
        }
        if (foundLayer) {
          if (wms) {
            // @ts-ignore
            foundLayer.props['url'] =
              wms.Capability.Request.GetMap.DCPType[0].HTTP.Get.OnlineResource;
          }
          let tags = foundLayer.tags;
          tags[0] = categoryObject.Title;
          foundLayer = { ...foundLayer, ...layer, tags, service };

          layers.push(foundLayer);
        }
      }
    }

    if (wms && serviceName === services[categoryConfig.serviceName].name) {
      const missingInConfig = findDifferences(
        getAllLeafLayers(wms),
        categoryConfig.layers
      );

      for (const layer of missingInConfig.missingInConfig) {
        const wmsLayer = findLayerAndAddTags(
          wms.Capability.Layer,
          layer.Name,
          []
        );
        let foundLayer = wmsLayerToGenericItem(wmsLayer, serviceName);
        // @ts-ignore
        foundLayer.props['url'] =
          wms.Capability.Request.GetMap.DCPType[0].HTTP.Get.OnlineResource;

        let tags = foundLayer.tags;
        tags[0] = categoryObject.Title;
        foundLayer = {
          ...foundLayer,
          ...layer,
          tags,
          service: services[categoryConfig.serviceName],
        };

        layers.push(foundLayer);
      }
    }

    categoryObject.layers = layers;
    structure.push(categoryObject);
  }

  return structure;
};

export const mergeStructures = (structure1, structure2) => {
  let mergedObj = {};

  structure1.forEach((obj) => {
    if (!mergedObj[obj.Title]) {
      mergedObj[obj.Title] = { Title: obj.Title, layers: [] };
    }
    mergedObj[obj.Title].layers.push(...obj.layers);
  });

  structure2.forEach((obj) => {
    if (!mergedObj[obj.Title]) {
      mergedObj[obj.Title] = { Title: obj.Title, layers: [] };
    }
    mergedObj[obj.Title].layers.push(...obj.layers);
  });

  let mergedArray = Object.values(mergedObj);
  return mergedArray;
};

export const findLayerAndAddTags = (layer, name, tagsToAdd) => {
  if (layer.Name === name) {
    if (!layer.Tags) {
      layer.tags = [];
    }
    layer.tags.push(...tagsToAdd);
    return layer;
  }
  if (layer.Layer) {
    for (const subLayer of layer.Layer) {
      const foundLayer = findLayerAndAddTags(subLayer, name, [
        ...tagsToAdd,
        layer.Title,
      ]);
      if (foundLayer) {
        return foundLayer;
      }
    }
  }
  return null;
};
