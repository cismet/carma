import {
  Color,
  ColorMaterialProperty,
  Entity,
  MaterialProperty,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Cartesian2,
} from "cesium";
import { useEffect, useRef } from "react";

import { pickFromClampedGeojson } from "../../utils/pickers";
import { useCesiumContext } from "../../hooks/useCesiumContext";

const restoreMaterial = (
  entity: Entity,
  originalMaterials: Map<Entity, MaterialProperty>
) => {
  const m = originalMaterials.get(entity);
  if (m) {
    entity.polygon!.material = m;
  }
};

// TODO sync geosjson selection by ID with the store to enable selection of the same entitiy in CityGm=ML tilesets
export const useSelectAndHighlightGeoJsonEntity = (options?: {
  highlightMaterial?: ColorMaterialProperty;
  selectedEntityId?: string | null; // TODO restore selection on mount
}) => {
  const handler = useRef<ScreenSpaceEventHandler | null>(null);
  const highlightEntity = useRef<Entity | null>(null);
  let { highlightMaterial } = options || {};
  highlightMaterial =
    highlightMaterial || new ColorMaterialProperty(Color.YELLOW.withAlpha(0.6));

  useEffect(() => {
    let originalMaterials: Map<Entity, MaterialProperty> | undefined;
    // For now, we'll skip the withScene functionality since we're removing withValid instances
    console.warn(
      "ByGeojsonClassifier hooks need to be updated to work without withScene"
    );

    return () => {
      handler.current && handler.current.destroy();
      if (originalMaterials) {
        highlightEntity.current &&
          restoreMaterial(highlightEntity.current, originalMaterials);
        originalMaterials.clear();
      }
    };
  }, [highlightMaterial]);
};
