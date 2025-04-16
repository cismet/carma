import {
  Camera,
  Cartesian3,
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
  }: { heading?: number; pitch?: number } = {} // prior
) => {
  const range = distanceFromZoomLevel(zoom);
  return new HeadingPitchRange(heading, pitch, range);
};

export const getHeadingPitchRangeFromHeight = (
  { positionCartographic, heading, pitch }: Camera,
  targetPosition: Cartographic
) => {
  const cameraHeight = positionCartographic.height;
  const targetHeight = targetPosition.height;
  const heightDifference = cameraHeight - targetHeight;

  const range = heightDifference / Math.cos(pitch);
  //console.log("getHPR from Height", Math.round(cameraHeight),Math.round(targetHeight),Math.round(heightDifference),Math.round(range), Math.cos(pitch),);
  return new HeadingPitchRange(heading, pitch, range);
};

export const getPositionWithHeightAsync = async (
  scene: Scene,
  position: Cartographic,
  useClampedHeight: boolean = false
) => {
  // Convert the Cartographic position to Cartesian3 coordinates
  const cartesianPosition = Cartographic.toCartesian(position);

  let updatedPosition: Cartographic | null = null;

  if (useClampedHeight) {
    // Attempt to clamp the position to the tileset's height
    try {
      const clampedPosition = await scene.clampToHeight(
        cartesianPosition
        //[tileset],
      );

      if (clampedPosition) {
        const clampedCartesian = clampedPosition;
        const clampedCartographic =
          Cartographic.fromCartesian(clampedCartesian);

        updatedPosition = new Cartographic(
          position.longitude,
          position.latitude,
          clampedCartographic.height
        );

        console.debug(
          "[CESIUM|TILESET] Clamped position found for position",
          position,
          updatedPosition
        );
      } else {
        console.warn(
          "[CESIUM|TILESET] No clamped position found for position",
          position
        );
      }
    } catch (error) {
      console.error(
        "[CESIUM|TILESET] Error clamping to tileset height:",
        error
      );
    }
  } else {
    console.debug("[CESIUM|TILESET] No Tileset provided, using terrain");
  }

  if (updatedPosition) {
    // Elevation obtained from the tileset
    return updatedPosition;
  } else {
    // Fall back to using terrain data
    const terrainProvider = scene.globe.terrainProvider;
    console.debug(
      "[CESIUM|TERRAIN] Using terrain provider",
      terrainProvider,
      "for position",
      position
    );

    try {
      const updatedPositions = await sampleTerrainMostDetailed(
        terrainProvider,
        [position]
      );
      const cartoPos = updatedPositions[0];

      if (cartoPos instanceof Cartographic) {
        console.debug(
          "[CESIUM|TERRAIN] Sampled terrain for position",
          position,
          cartoPos
        );
        return cartoPos;
      } else {
        console.warn(
          "[CESIUM|TERRAIN] Could not get elevation for position",
          position,
          cartoPos
        );
        return position;
      }
    } catch (error) {
      console.error("[CESIUM|TERRAIN] Error sampling terrain:", error);
      return position;
    }
  }
};

export const validateWorldCoordinate = (
  testPosition: Cartesian3 | Camera,
  center: Cartesian3,
  range: number = 50000,
  minHeight: number = 0
): boolean => {
  const wc =
    testPosition instanceof Camera ? testPosition.positionWC : testPosition;
  return (
    Cartesian3.distance(wc, center) <= range &&
    Cartographic.fromCartesian(wc).height >= minHeight
  );
};
