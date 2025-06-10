import { type StyleSpecification, type LayerSpecification } from "maplibre-gl";
import slugify from "slugify";

const getPaintProperty = (layerStyle: LayerSpecification) => {
  const type = layerStyle.type;
  switch (type) {
    case "symbol":
      return layerStyle.id.includes("labels") ? "text-opacity" : "icon-opacity";
    case "raster":
      return "raster-opacity";
    case "line":
      return "line-opacity";
    case "fill":
      return "fill-opacity";
    default:
      return "icon-opacity";
  }
};

export const vectorStylesToMapLibreStyle = async (vectorStyles: string[]) => {
  const defaultSprite = "https://tiles.cismet.de/poi/sprites";
  const customSprites: maplibregl.SpriteSpecification = [];

  const style: StyleSpecification = {
    version: 8,
    sources: {
      terrainSource: {
        type: "raster-dem",
        tiles: [
          "https://wuppertal-terrain.cismet.de/services/wupp_dgm_01/tiles/{z}/{x}/{y}.png",
        ],
        tileSize: 512,
        maxzoom: 15,
      },
      "source-amtlich": {
        type: "raster",
        tiles: [
          "https://geodaten.metropoleruhr.de/spw2?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=spw2_light&STYLE=default&FORMAT=image/png&TILEMATRIXSET=webmercator_hq&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}",
        ],
        tileSize: 256,
      },
    },
    layers: [
      {
        id: "layer-amtlich",
        type: "raster",
        source: "source-amtlich",
        paint: { "raster-opacity": 0.9 },
      },
    ],
    glyphs: "https://tiles.cismet.de/fonts/{fontstack}/{range}.pbf",
    sprite: defaultSprite,
  };

  const layerPromises = vectorStyles.map(async (vectorStyle, index) => {
    const response = await fetch(vectorStyle);
    const additionalStyle = await response.json();
    const layerId = vectorStyle;
    let spriteId = layerId.replace(":", "_");
    if (additionalStyle.sprite) {
      spriteId = slugify(additionalStyle.sprite, {
        remove: /[^a-zA-Z0-9]/g,
        lower: true,
      });

      const spriteExists = customSprites.some(
        (sprite) => sprite.id === spriteId
      );
      if (!spriteExists) {
        customSprites.push({
          id: spriteId,
          url: additionalStyle.sprite,
        });
      }
    }
    additionalStyle.layers = additionalStyle.layers.map((styleLayer) => ({
      ...styleLayer,
      id: `${layerId}-${styleLayer.id}`,
      metadata: {
        ...styleLayer.metadata,
        "z-index": index,
        "layer-id": layerId,
      },
      paint: {
        ...styleLayer.paint,
        ...(styleLayer.id.toLowerCase().includes("selection")
          ? {}
          : {
              [getPaintProperty(styleLayer)]: 1,
            }),
      },
      layout: {
        ...styleLayer.layout,
        ...(styleLayer.layout?.["icon-image"] !== undefined
          ? {
              "icon-image": [
                "concat",
                `${spriteId}:`,
                styleLayer.layout?.["icon-image"],
              ],
            }
          : {}),
      },
    }));

    style.sources = { ...style.sources, ...additionalStyle.sources };
    style.layers = [...style.layers, ...additionalStyle.layers];
  });

  await Promise.all(layerPromises);

  if (customSprites.length > 0) {
    style.sprite = customSprites;
  }

  return style;
};
