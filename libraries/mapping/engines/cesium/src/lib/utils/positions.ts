import {
  Cartographic,
  HeadingPitchRange,
  sampleTerrainMostDetailed,
  Scene,
} from "cesium";

export const distanceFromZoomLevel = (zoom: number) => {
  return 40000000 / Math.pow(2, zoom);
};

export const getHeadingPitchRangeFromZoom = (
  zoom: number,
  {
    heading = 0,
    pitch = Math.PI / 2,
  }: { heading?: number; pitch?: number } = {}, // prior
) => {
  const range = distanceFromZoomLevel(zoom);
  return new HeadingPitchRange(heading, pitch, range);
};

export const getPositionWithHeightAsync = async (
  scene: Scene,
  position: Cartographic,
  useClampedHeight: boolean = false,
) => {
  // Convert the Cartographic position to Cartesian3 coordinates
  const cartesianPosition = Cartographic.toCartesian(position);

  let updatedPosition: Cartographic | null = null;

  if (useClampedHeight) {
    // Attempt to clamp the position to the tileset's height
    try {
      const clampedPosition = await scene.clampToHeight(
        cartesianPosition,
        //[tileset],
      );

      if (clampedPosition) {
        const clampedCartesian = clampedPosition;
        const clampedCartographic =
          Cartographic.fromCartesian(clampedCartesian);

        updatedPosition = new Cartographic(
          position.longitude,
          position.latitude,
          clampedCartographic.height,
        );

        console.info(
          "[CESIUM|TILESET] Clamped position found for position",
          position,
          updatedPosition,
        );
      } else {
        console.warn(
          "[CESIUM|TILESET] No clamped position found for position",
          position,
        );
      }
    } catch (error) {
      console.error(
        "[CESIUM|TILESET] Error clamping to tileset height:",
        error,
      );
    }
  } else {
    console.info("[CESIUM|TILESET] No Tileset provided, using terrain");
  }

  if (updatedPosition) {
    // Elevation obtained from the tileset
    return updatedPosition;
  } else {
    // Fall back to using terrain data
    const terrainProvider = scene.globe.terrainProvider;
    console.log(
      "[CESIUM|TERRAIN] Using terrain provider",
      terrainProvider,
      "for position",
      position,
    );

    try {
      const updatedPositions = await sampleTerrainMostDetailed(
        terrainProvider,
        [position],
      );
      const cartoPos = updatedPositions[0];

      if (cartoPos instanceof Cartographic) {
        console.info(
          "[CESIUM|TERRAIN] Sampled terrain for position",
          position,
          cartoPos,
        );
        return cartoPos;
      } else {
        console.warn(
          "[CESIUM|TERRAIN] Could not get elevation for position",
          position,
          cartoPos,
        );
        return position;
      }
    } catch (error) {
      console.error("[CESIUM|TERRAIN] Error sampling terrain:", error);
      return position;
    }
  }
};
