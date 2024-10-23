import WMSCapabilities from "wms-capabilities";

// @ts-expect-error TODO fix argument count
const parser = new WMSCapabilities();

export const getAllLayers = async () => {
  let categories: any[] = [];
  for (const key in serviceConfig) {
    await fetch(
      `${serviceConfig[key].url}?service=WMS&request=GetCapabilities&version=1.1.1`,
    )
      .then((response) => {
        return response.text();
      })
      .then((text) => {
        const result = parser.toJSON(text);
        if (result) {
          const flattenedLayer = flattenLayer(
            result.Capability.Layer,
            [],
            serviceConfig[key].url,
          );
          const queryableLayers = flattenedLayer.layers.filter(
            (layer) => layer.queryable,
          );
          const category = {
            title: serviceConfig[key].name,
            layers: queryableLayers,
          };
          if (queryableLayers.length > 0) {
            categories.push(category);
          }
        }
      });
  }

  return categories;
};

export const flattenLayer = (
  layer: any,
  parentTitles: any = [],
  url: string,
) => {
  const layerTitle = layer.Title;
  const layerTags = [...parentTitles, layerTitle];

  const flattenedLayer: any = {
    Title: layerTitle,
    Name: layer.Name ? layer.Name : "",
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
      if (flattennedSubLayer.Name !== "") {
        childLayers.push(flattennedSubLayer);
      }
    });
    flattenedLayer.layers = childLayers;
  }

  return flattenedLayer;
};

const serviceConfig = {
  wuppKarten: {
    url: "https://maps.wuppertal.de/karten",
    name: "Karten",
  },
  wuppUmwelt: {
    url: "https://maps.wuppertal.de/umwelt",
    name: "Umwelt",
  },
  wuppInfra: {
    url: "https://maps.wuppertal.de/infra",
    name: "Infra",
  },
  wuppPOI: {
    url: "https://maps.wuppertal.de/poi",
    name: "Poi",
  },
  wuppPlanung: {
    url: "https://maps.wuppertal.de/planung",
    name: "Planung",
  },
  wuppInspire: {
    url: "https://maps.wuppertal.de/inspire",
    name: "Inspire",
  },
  wuppImmo: {
    url: "https://maps.wuppertal.de/immo",
    name: "Immo",
  },
  wuppVerkehr: {
    url: "https://maps.wuppertal.de/verkehr",
    name: "Verkehr",
  },
  wuppGebiet: {
    url: "https://maps.wuppertal.de/gebiet",
    name: "Gebiet",
  },
};
