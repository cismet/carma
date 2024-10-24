import { useState, useEffect, FC } from "react";
import { Cesium3DTileset as Resium3dTileset, useCesium } from "resium";
import {
  Cesium3DTileFeature,
  Cesium3DTileStyle,
  ClassificationType,
  Color,
} from "cesium";

import { TilesetConfig } from "@carma-commons/resources";

import { useClickActionTileset } from "./hooks";

interface ByTilesetClassifier {
  debug?: boolean;
  target?: string;
  style?: Cesium3DTileStyle;
  tileset: TilesetConfig;
  classificationType?: ClassificationType;
}

const HIGHLIGHT_COLOR = Color.YELLOW;
const ByTilesetClassifier: FC<ByTilesetClassifier> = ({
  tileset,
  debug = false,
  classificationType = ClassificationType.CESIUM_3D_TILE,
  style,
}) => {
  const { viewer } = useCesium();

  const selectionTransparency = 0.5;
  // const selectionRef = useRef<SelectionRef | null>(null);
  const [selectedFeature, setSelectedFeature] =
    useState<Cesium3DTileFeature | null>(null);

  const clickData = useClickActionTileset(
    viewer,
    tileset.url,
    setSelectedFeature
  );

  useEffect(() => {
    console.debug("HOOK: selectedFeature");
    if (selectedFeature === null) {
      // console.debug('selectedFeature is null');
    } else {
      selectedFeature.color = HIGHLIGHT_COLOR.withAlpha(selectionTransparency);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFeature, clickData]);

  return (
    <Resium3dTileset
      url={tileset.url}
      debugShowBoundingVolume={debug}
      classificationType={classificationType}
      preloadWhenHidden={true}
      style={style}
    />
  );
};

export default ByTilesetClassifier;
