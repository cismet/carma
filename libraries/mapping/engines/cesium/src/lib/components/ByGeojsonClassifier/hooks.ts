import {
  Color,
  ColorMaterialProperty,
  Entity,
  MaterialProperty,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Viewer,
} from "cesium";
import { useEffect, useRef } from "react";

import { pickFromClampedGeojson } from "../../utils/cesiumHelpers";

const restoreMaterial = (
  entity: Entity,
  originalMaterials: Map<Entity, MaterialProperty>,
) => {
  const m = originalMaterials.get(entity);
  if (m) {
    entity.polygon!.material = m;
  }
};

// TODO sync geosjson selection by ID with the store to enable selection of the same entitiy in CityGm=ML tilesets

export const useSelectAndHighlightGeoJsonEntity = (
  viewer?: Viewer,
  options?: {
    highlightMaterial?: ColorMaterialProperty;
    isPrimaryStyle?: boolean;
    selectedEntityId?: string | null; // TODO restore selection on mount
  },
) => {
  const handler = useRef<ScreenSpaceEventHandler | null>(null);
  const highlightEntity = useRef<Entity | null>(null);
  let { highlightMaterial, isPrimaryStyle } = options || {};
  highlightMaterial =
    highlightMaterial || new ColorMaterialProperty(Color.YELLOW.withAlpha(0.6));
  isPrimaryStyle = isPrimaryStyle === undefined ? false : isPrimaryStyle;

  useEffect(() => {
    if (!isPrimaryStyle) {
      return;
    }
    let originalMaterials;
    if (viewer) {
      originalMaterials = new Map<Entity, MaterialProperty>();
      console.log("HOOK ByGeoJsonClassifier add ScreenSpaceEventHandler");
      handler.current = new ScreenSpaceEventHandler(viewer.scene.canvas);

      const perEntityAction = (entity: Entity) => {
        // console.log('GroundPrimitive', entity);
        if (!entity.polygon) {
          return;
        }
        if (highlightMaterial) {
          if (highlightEntity.current === null) {
            //console.log('highlight first');
            originalMaterials.set(entity, entity.polygon.material);
            entity.polygon.material = highlightMaterial;
            highlightEntity.current = entity;
          } else {
            if (highlightEntity.current.id === entity.id) {
              //console.log('highlight off');
              //entity.polygon.material = originialMaterials.get(entity);
              restoreMaterial(entity, originalMaterials);
              highlightEntity.current = null;
            } else {
              //console.log('highlight next');
              restoreMaterial(highlightEntity.current, originalMaterials);
              originalMaterials.set(entity, entity.polygon.material);
              entity.polygon.material = highlightMaterial;
              highlightEntity.current = entity;
            }
          }
        }
      };

      handler.current.setInputAction((event) => {
        let hasPick = false;

        // last picked object is the top one we need for highlighting
        const lastGroundPrimitive = pickFromClampedGeojson(
          viewer,
          event.position,
        );
        if (lastGroundPrimitive) {
          hasPick = true;
          perEntityAction(lastGroundPrimitive);
        }

        if (!hasPick && highlightEntity.current) {
          // console.log('highlight off (no Target)');
          restoreMaterial(highlightEntity.current, originalMaterials);
        }
      }, ScreenSpaceEventType.LEFT_CLICK);
    }

    return () => {
      handler.current && handler.current.destroy();
      if (originalMaterials) {
        highlightEntity.current &&
          restoreMaterial(highlightEntity.current, originalMaterials);
        originalMaterials.clear();
      }
    };
  }, [viewer, highlightMaterial, isPrimaryStyle]);
};
