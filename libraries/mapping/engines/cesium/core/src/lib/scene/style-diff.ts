import type { Cesium3DTileset, ImageryLayer } from "@carma/cesium";
import type { SceneStyle } from "@carma/cesium/types";

/**
 * Represents a change needed to sync scene state with desired style
 */
export type ResourceChange = {
  id: string;
  action: "show" | "hide";
  opacity?: number;
};

/**
 * Diff tileset state using the loaded tilesets map
 *
 * @param loadedTilesets - Map of ID -> Cesium3DTileset from the manager
 * @param desiredStyle - The target style configuration
 * @param allAvailableTilesetIds - All tileset IDs from all styles
 */
export function diffTilesets(
  loadedTilesets: Map<string, Cesium3DTileset>,
  desiredStyle: SceneStyle,
  allAvailableTilesetIds: Set<string>
): ResourceChange[] {
  const desiredVisible = new Set(desiredStyle.tilesets?.map((t) => t.id) || []);

  const changes: ResourceChange[] = [];

  // Check each available tileset ID
  allAvailableTilesetIds.forEach((id) => {
    const tileset = loadedTilesets.get(id);
    const shouldBeVisible = desiredVisible.has(id);

    // Only check if tileset is loaded
    if (tileset && !tileset.isDestroyed()) {
      const isCurrentlyVisible = tileset.show;

      if (!isCurrentlyVisible && shouldBeVisible) {
        changes.push({ id, action: "show" });
      } else if (isCurrentlyVisible && !shouldBeVisible) {
        changes.push({ id, action: "hide" });
      }
    } else if (shouldBeVisible) {
      // Tileset not loaded yet but should be visible - trigger load
      changes.push({ id, action: "show" });
    }
  });

  // Check for opacity changes on visible tilesets
  desiredStyle.tilesets?.forEach(({ id, opacity }) => {
    if (id && opacity !== undefined && desiredVisible.has(id)) {
      const existing = changes.find((c) => c.id === id);
      if (existing) {
        existing.opacity = opacity;
      } else {
        changes.push({ id, action: "show", opacity });
      }
    }
  });

  return changes;
}

/**
 * Diff imagery layer state using the loaded layers map
 *
 * @param loadedLayers - Map of ID -> ImageryLayer from the manager
 * @param desiredStyle - The target style configuration
 * @param allAvailableImageryIds - All imagery IDs from all styles
 */
export function diffImageryLayers(
  loadedLayers: Map<string, ImageryLayer>,
  desiredStyle: SceneStyle,
  allAvailableImageryIds: Set<string>
): ResourceChange[] {
  const desiredVisible = new Set(
    desiredStyle.imageryLayers?.map((il) => il.id) || []
  );

  const changes: ResourceChange[] = [];

  // Check each available imagery layer ID
  allAvailableImageryIds.forEach((id) => {
    const layer = loadedLayers.get(id);
    const shouldBeVisible = desiredVisible.has(id);

    // Only check if layer is loaded
    if (layer && !layer.isDestroyed()) {
      const isCurrentlyVisible = layer.show;

      if (!isCurrentlyVisible && shouldBeVisible) {
        changes.push({ id, action: "show" });
      } else if (isCurrentlyVisible && !shouldBeVisible) {
        changes.push({ id, action: "hide" });
      }
    } else if (shouldBeVisible) {
      // Layer not loaded yet but should be visible - trigger load
      changes.push({ id, action: "show" });
    }
  });

  // Check for opacity changes on visible layers
  desiredStyle.imageryLayers?.forEach(({ id, opacity }) => {
    if (opacity !== undefined && desiredVisible.has(id)) {
      const existing = changes.find((c) => c.id === id);
      if (existing) {
        existing.opacity = opacity;
      } else {
        changes.push({ id, action: "show", opacity });
      }
    }
  });

  return changes;
}
