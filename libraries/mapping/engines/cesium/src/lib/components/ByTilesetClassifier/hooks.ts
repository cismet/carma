import { useEffect, useState } from "react";

import {
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  defined,
  Viewer,
  Cesium3DTileFeature,
  Cartesian2,
  Cartesian3,
} from "cesium";

export type ClickTilesetData = {
  feature: Cesium3DTileFeature | null;
  properties: Record<string, unknown> | null;
  screenPos: Cartesian2 | null;
  pickPos: Cartesian3 | null;
};

export const useClickActionTileset = (
  viewer: Viewer | undefined,
  url: string,
  setSelectedFeature: (feature: Cesium3DTileFeature | null) => void,
  drillPickLimit = 5,
) => {
  const [clickData, setClickData] = useState<ClickTilesetData | null>(null);
  //const url = useViewerDataSources().tileset.url;

  useEffect(() => {
    console.log("HOOK: useClickActionTileset");
    if (!viewer?.scene || !viewer?.canvas) return;
    const { canvas, scene } = viewer;

    const handler = new ScreenSpaceEventHandler(canvas);

    const clickAction = ({
      position,
    }: ScreenSpaceEventHandler.PositionedEvent) => {
      if (!position) return;
      const pickedObjects = scene.drillPick(position, drillPickLimit);
      let feature;

      for (let i = 0; i < pickedObjects.length; i++) {
        if (
          pickedObjects[i] instanceof Cesium3DTileFeature &&
          pickedObjects[i].tileset._url === url
        ) {
          // console.log('url', pickedObjects[i].tileset._url);
          feature = pickedObjects[i];
          break;
        }
      }

      const pickedPosition = position && scene.pickPosition(position);

      if (defined(feature)) {
        if (feature instanceof Cesium3DTileFeature) {
          const propertyIds = feature.getPropertyIds();
          const properties = propertyIds.reduce((acc, propertyId) => {
            return {
              ...acc,
              [propertyId]: feature.getProperty(propertyId),
            };
          }, {});

          setSelectedFeature(feature);
          // console.log('clickAction', feature, properties);

          setClickData({
            feature,
            properties,
            screenPos: position,
            pickPos: pickedPosition,
          });
        }
      } else {
        setSelectedFeature(null);
        setClickData(null);
      }
    };
    handler.setInputAction(clickAction, ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      handler.removeInputAction(ScreenSpaceEventType.LEFT_CLICK);
      handler.destroy();
    };
  }, [viewer, url, drillPickLimit, setSelectedFeature]);

  return clickData;
};
