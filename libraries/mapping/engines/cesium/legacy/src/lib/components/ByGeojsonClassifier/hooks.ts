import {
  Color,
  ColorGeometryInstanceAttribute,
  GroundPrimitive,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
} from "@carma/cesium";
import { useEffect, useRef } from "react";

import { CesiumContextType } from "../../CesiumContext";
import { pickFromClampedGeojson } from "../../utils/pick-position/pick-ground-primitive";

interface PrimitiveColorState {
  primitive: GroundPrimitive;
  id: string;
  originalColor: Color;
}

const restoreColor = (primitiveState: PrimitiveColorState | null) => {
  if (!primitiveState) return;

  const { primitive, id, originalColor } = primitiveState;
  const attributes = primitive.getGeometryInstanceAttributes(id);
  if (attributes && attributes.color) {
    attributes.color = ColorGeometryInstanceAttribute.toValue(originalColor);
  }
};

const setHighlightColor = (
  primitive: GroundPrimitive,
  id: string,
  color: Color
): PrimitiveColorState | null => {
  const attributes = primitive.getGeometryInstanceAttributes(id);
  if (!attributes || !attributes.color) {
    return null;
  }

  const originalColor = Color.fromBytes(
    attributes.color[0],
    attributes.color[1],
    attributes.color[2],
    attributes.color[3]
  );

  attributes.color = ColorGeometryInstanceAttribute.toValue(color);

  return {
    primitive,
    id,
    originalColor,
  };
};

// TODO sync geojson selection by ID with the store to enable selection of the same entity in CityGML tilesets

export const useSelectAndHighlightGeoJsonEntity = (
  ctx: CesiumContextType,
  options?: {
    highlightColor?: Color;
    isPrimaryStyle?: boolean;
    selectedEntityId?: string | null; // TODO restore selection on mount
  }
) => {
  const handler = useRef<ScreenSpaceEventHandler | null>(null);
  const highlightedPrimitive = useRef<PrimitiveColorState | null>(null);
  const {
    highlightColor = Color.YELLOW.withAlpha(0.6),
    isPrimaryStyle = false,
  } = options || {};

  useEffect(() => {
    if (!isPrimaryStyle) {
      return;
    }

    if (ctx.isValidViewer()) {
      const viewer = ctx.viewerRef.current!;
      console.debug("HOOK ByGeoJsonClassifier add ScreenSpaceEventHandler");
      handler.current = new ScreenSpaceEventHandler(viewer.scene.canvas);

      const handlePrimitiveClick = (primitive: GroundPrimitive) => {
        // Get the geometry instance ID from the primitive
        // Note: GeoJSON features create geometry instances with the feature ID
        const geometryInstanceIds = (primitive as any)._instanceIds || [];

        if (geometryInstanceIds.length === 0) {
          console.warn("No geometry instance IDs found on GroundPrimitive");
          return;
        }

        // Use the first ID (for single-feature primitives) or implement selection logic
        const id = geometryInstanceIds[0];

        if (highlightedPrimitive.current === null) {
          // Highlight first time
          const state = setHighlightColor(primitive, id, highlightColor);
          if (state) {
            highlightedPrimitive.current = state;
          }
        } else {
          const current = highlightedPrimitive.current;
          if (current.primitive === primitive && current.id === id) {
            // Clicking same primitive - toggle off
            restoreColor(current);
            highlightedPrimitive.current = null;
          } else {
            // Clicking different primitive - switch highlight
            restoreColor(current);
            const state = setHighlightColor(primitive, id, highlightColor);
            if (state) {
              highlightedPrimitive.current = state;
            }
          }
        }
      };

      handler.current.setInputAction((event) => {
        const scene = viewer.scene;

        // Pick the top GroundPrimitive from clamped GeoJSON
        const pickedPrimitive = pickFromClampedGeojson(scene, event.position);

        if (pickedPrimitive) {
          handlePrimitiveClick(pickedPrimitive);
        } else if (highlightedPrimitive.current) {
          // Click on empty space - restore highlight
          restoreColor(highlightedPrimitive.current);
          highlightedPrimitive.current = null;
        }
      }, ScreenSpaceEventType.LEFT_CLICK);
    }

    return () => {
      handler.current && handler.current.destroy();
      if (highlightedPrimitive.current) {
        restoreColor(highlightedPrimitive.current);
        highlightedPrimitive.current = null;
      }
    };
  }, [ctx, highlightColor, isPrimaryStyle]);
};
