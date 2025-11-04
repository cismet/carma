import { FC } from "react";
import { useSelector } from "react-redux";
import { GeoJsonDataSource as ResiumGeoJsonDataSource } from "resium";
import { useCesiumContext } from "../../hooks/useCesiumContext";

import {
  ClassificationType,
  Color,
  ColorMaterialProperty,
  ConstantProperty,
  defined,
  GeoJsonDataSource,
} from "cesium";

import { GeoJsonConfig } from "../../..";
import { selectShowPrimaryTileset } from "../../slices/cesium";

import { useSelectAndHighlightGeoJsonEntity } from "./hooks";
import { SELECTABLE_TRANSPARENT_MATERIAL } from "../../utils/cesiumHelpers";

interface ByGeoJsonClassifier {
  debug?: boolean;
  geojson: GeoJsonConfig;
  classificationType?: ClassificationType;
}

const HIGHLIGHT_COLOR = Color.YELLOW.withAlpha(0.6);

const ByGeoJsonClassifier: FC<ByGeoJsonClassifier> = ({
  debug = false,
  classificationType = ClassificationType.CESIUM_3D_TILE,
  geojson,
}) => {
  const ctx = useCesiumContext();

  const isPrimaryStyle = useSelector(selectShowPrimaryTileset);

  const classificationTypeProperty = new ConstantProperty(classificationType);

  useSelectAndHighlightGeoJsonEntity(ctx, {
    highlightColor: HIGHLIGHT_COLOR,
    isPrimaryStyle,
  });

  const handleOnLoad = (dataSource: GeoJsonDataSource) => {
    dataSource.entities.values.forEach((entity) => {
      if (defined(entity.polygon)) {
        const randomColor = Color.fromRandom({ alpha: 0.1 });
        const randomMaterial = new ColorMaterialProperty(randomColor);
        // Set the random material and classification type on the polygon
        entity.polygon.material = randomMaterial;
        // entity.polygon.height = undefined;
        // entity.polygon.height = undefined; // if you want to use the classificationType make sure height his is undefined or the area is extruded with extrusionHeight, otherwise this wont work
        entity.polygon.classificationType = classificationTypeProperty;
        entity.polygon.material = debug
          ? new ColorMaterialProperty(Color.fromRandom({ alpha: 0.5 }))
          : SELECTABLE_TRANSPARENT_MATERIAL;
      }
    });
  };

  return (
    <ResiumGeoJsonDataSource
      show={isPrimaryStyle}
      data={geojson.url}
      clampToGround={true} // IMPORTANT, sets the entitity polygon height to undefined for classification to work
      onLoad={handleOnLoad}
    />
  );
};

export default ByGeoJsonClassifier;
