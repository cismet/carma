import { GeoJsonDataSource as ResiumGeoJsonDataSource } from "resium";

import {
  ClassificationType,
  Color,
  ColorMaterialProperty,
  ConstantProperty,
  defined,
  GeoJsonDataSource,
} from "cesium";

import type { GeoJsonConfig } from "@carma/geo/types";
import { useCesiumContext } from "../../hooks/useCesiumContext";

import { useSelectAndHighlightGeoJsonEntity } from "./hooks";

const SELECTABLE_TRANSPARENT_MATERIAL = new ColorMaterialProperty(
  Color.BLACK.withAlpha(1 / 255)
);

interface ByGeoJsonClassifier {
  debug?: boolean;
  geojson: GeoJsonConfig;
  selectionId?: number | string | null;
  selected?: boolean;
  selectableEntities?: boolean;
  onEntitySelected?: (featureId: string | number | undefined) => void;
  classificationType?: ClassificationType;
}

export const ByGeojsonClassifier = ({
  selectionId,
  onEntitySelected,
  selected = false,
  selectableEntities,
  classificationType = ClassificationType.CESIUM_3D_TILE,
  geojson,
  debug,
}: ByGeoJsonClassifier) => {
  const classificationTypeProperty = new ConstantProperty(classificationType);

  const HIGHLIGHT_MATERIAL = new ColorMaterialProperty(
    Color.YELLOW.withAlpha(0.5)
  );

  useSelectAndHighlightGeoJsonEntity({
    highlightMaterial: HIGHLIGHT_MATERIAL,
    selectedEntityId:
      typeof selectionId === "string"
        ? selectionId
        : selectionId?.toString() ?? null,
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
      show={true}
      data={geojson.url}
      clampToGround={true} // IMPORTANT, sets the entitity polygon height to undefined for classification to work
      onLoad={handleOnLoad}
    />
  );
};

export default ByGeojsonClassifier;
