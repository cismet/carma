import { MutableRefObject, useEffect, useRef } from "react";
import {
  Viewer,
  Cartographic,
  Cartesian2,
  Cartesian3,
  Math as CesiumMath,
  Matrix4,
  HeadingPitchRoll,
  BoundingSphere,
  defined,
  TerrainProvider,
  sampleTerrainMostDetailed,
} from "cesium";

enum SampledPositions {
  UnderCamera,
  TransformCenter,
  //ScreenCenter,
  //ScreenCenterBottom,
}

export interface SampledPosition {
  type: SampledPositions;
  pickedPosition: Cartesian3 | null;
  height: Cartographic;
  heightMostDetailed: Cartographic | null;
  pixelSize: number | null;
  terrainMostDetailed: Cartographic | null;
  surfaceMostDetailed: Cartographic | null;
}

export interface Positions {
  underCamera: SampledPosition;
  transformCenter: SampledPosition;
}

export interface CameraState {
  // TODO test if 6DOF could all be derived as need from single transform matrix only when needed
  // don't expect any perfomrance hit from this so for good DX it's worth it cloning and storing the individual derived values on every render
  position: Cartesian3;
  positionWC: Cartesian3;
  positionCartographic: Cartographic;
  transform: Matrix4;
  orientation: HeadingPitchRoll;
  //frustum: Frustum | null; TODO add fov and orthographic type
}

export interface SceneState {
  frameIndex: number;
  lastUpdate: number; // time when last update was completed
  lastUpdateHeight: number; // time when last height update was completed
  lastUpdateStart: number; // time when last update started
  camera: CameraState;
  positions: Positions;
  distances: {
    toCenter: number;
    toSurface: number;
    toTerrain: number;
  };
  pixelSize: number | null;
  pixelSizeComputed: Cartesian2 | null;
}

const SAMPLE_BOUNDING_SPHERE_RADIUS = 10;

const sampleBoundingSphere = new BoundingSphere(
  Cartesian3.ZERO,
  SAMPLE_BOUNDING_SPHERE_RADIUS,
); // to be reused for all terrain samples

type SceneStateUpdaterProps = {
  cameraPercentageChanged?: number;
  viewer: Viewer | null;
  sceneStateRef: MutableRefObject<SceneState | null>;
  terrainProvider: TerrainProvider | null;
  surfaceProvider: TerrainProvider | null;
  onSceneStateUpdate: () => void;
};

const useSceneStateUpdater = ({
  cameraPercentageChanged,
  viewer,
  sceneStateRef,
  terrainProvider,
  surfaceProvider,
  onSceneStateUpdate,
}: SceneStateUpdaterProps) => {
  const frameIndexRef = useRef<number>(0);
  const isUpdatingRef = useRef<boolean>(false);

  const originalCameraPercentageChangedRef = useRef<number | null>(null);

  useEffect(() => {
    if (!viewer) return;
    const { scene, camera } = viewer;
    // TODO dynamically add markers and symbolic objects here, or remove them from scene before transition
    const updateSceneState = async () => {
      const sampleHeightSceneObjectsToExclude = [scene.globe.ellipsoid];
      if (isUpdatingRef.current) return;
      isUpdatingRef.current = true;
      try {
        const currentTime = Date.now();
        frameIndexRef.current += 1;
        const newState = {
          lastUpdateStart: currentTime,
          frameIndex: frameIndexRef.current,
        };
        const cameraState: CameraState = {
          position: camera.position.clone(),
          positionWC: camera.positionWC.clone(),
          positionCartographic: camera.positionCartographic.clone(),
          orientation: new HeadingPitchRoll(
            camera.heading,
            camera.pitch,
            camera.roll,
          ),
          transform: camera.transform.clone(),
        };

        // get position to sample terrain at
        // TODO provide center position as a hook
        const canvasWidth = viewer.canvas.clientWidth;
        const canvasHeight = viewer.canvas.clientHeight;
        const center = new Cartesian2(canvasWidth / 2, canvasHeight / 2);

        // Pick position at center
        const centerPosition = scene.pickPosition(center);
        const centerPositionCartographic =
          Cartographic.fromCartesian(centerPosition);

        const centerSampledHeight = scene.sampleHeight(
          centerPositionCartographic,
          sampleHeightSceneObjectsToExclude,
          SAMPLE_BOUNDING_SPHERE_RADIUS,
        );
        const underCameraSampledHeight = scene.sampleHeight(
          cameraState.positionCartographic,
          sampleHeightSceneObjectsToExclude,
          SAMPLE_BOUNDING_SPHERE_RADIUS,
        );

        const positions: Positions = {
          underCamera: {
            type: SampledPositions.UnderCamera,
            height: Object.assign(cameraState.positionCartographic.clone(), {
              height: underCameraSampledHeight,
            }),
            pixelSize: null,
            pickedPosition: null,
            heightMostDetailed: null,
            terrainMostDetailed: null,
            surfaceMostDetailed: null,
          },
          transformCenter: {
            type: SampledPositions.TransformCenter,
            pickedPosition: centerPosition,
            height: Object.assign(centerPositionCartographic.clone(), {
              height: centerSampledHeight,
            }),
            heightMostDetailed: null,
            pixelSize: null,
            terrainMostDetailed: null,
            surfaceMostDetailed: null,
          },
        };

        const lastUpdateHeight = Date.now();

        // This takes ~100ms vs 5 with the non async version

        const [underCameraHeightMostDetailed, centerHeightMostDetailed] =
          await scene.sampleHeightMostDetailed(
            [
              cameraState.positionCartographic.clone(),
              centerPositionCartographic.clone(),
            ],
            sampleHeightSceneObjectsToExclude,
            SAMPLE_BOUNDING_SPHERE_RADIUS,
          );

        if (defined(underCameraHeightMostDetailed)) {
          positions.underCamera.heightMostDetailed =
            underCameraHeightMostDetailed;
        } else {
          console.log("nulling under camera height most detailed");
        }

        if (defined(centerHeightMostDetailed)) {
          positions.transformCenter.heightMostDetailed =
            centerHeightMostDetailed;
        } else {
          console.log("nulling screen center height most detailed");
        }

        if (terrainProvider) {
          const [underCameraTerrainMostDetailed, centerTerrainMostDetailed] =
            await sampleTerrainMostDetailed(terrainProvider, [
              cameraState.positionCartographic.clone(),
              centerPositionCartographic.clone(),
            ]);

          if (defined(underCameraTerrainMostDetailed)) {
            positions.underCamera.terrainMostDetailed =
              underCameraTerrainMostDetailed;
          } else {
            console.log("nulling under camera terrain most detailed");
          }

          if (defined(centerTerrainMostDetailed)) {
            positions.transformCenter.terrainMostDetailed =
              centerTerrainMostDetailed;
          } else {
            console.log("nulling screen center terrain most detailed");
          }
        }

        if (surfaceProvider) {
          const [underCameraSurfaceMostDetailed, centerSurfaceMostDetailed] =
            await sampleTerrainMostDetailed(surfaceProvider, [
              cameraState.positionCartographic.clone(),
              centerPositionCartographic.clone(),
            ]);

          if (defined(underCameraSurfaceMostDetailed)) {
            positions.underCamera.surfaceMostDetailed =
              underCameraSurfaceMostDetailed;
          } else {
            console.log("nulling under camera surface most detailed");
          }

          if (defined(centerSurfaceMostDetailed)) {
            positions.transformCenter.surfaceMostDetailed =
              centerSurfaceMostDetailed;
          } else {
            console.log("nulling screen center surface most detailed");
          }
        }

        const centerCartesian = Cartographic.toCartesian(
          positions.transformCenter.heightMostDetailed ??
            positions.transformCenter.surfaceMostDetailed ??
            positions.transformCenter.terrainMostDetailed ??
            positions.transformCenter.height,
        );

        const distanceToCenter = Cartesian3.distance(
          cameraState.position,
          centerCartesian,
        );

        const distanceToSurface = Cartesian3.distance(
          cameraState.position,
          Cartographic.toCartesian(
            positions.transformCenter.heightMostDetailed ??
              positions.transformCenter.surfaceMostDetailed ??
              positions.transformCenter.height,
          ),
        );

        const distanceToTerrain = Cartesian3.distance(
          cameraState.position,
          Cartographic.toCartesian(
            positions.transformCenter.terrainMostDetailed ??
              positions.transformCenter.height,
          ),
        );

        sampleBoundingSphere.center = centerCartesian;

        sceneStateRef.current = {
          ...newState,
          distances: {
            toCenter: distanceToCenter,
            toSurface: distanceToSurface,
            toTerrain: distanceToTerrain,
          },
          pixelSize: camera.getPixelSize(
            sampleBoundingSphere,
            scene.drawingBufferWidth,
            scene.drawingBufferHeight,
          ),
          pixelSizeComputed: camera.frustum.getPixelDimensions(
            scene.drawingBufferWidth,
            scene.drawingBufferHeight,
            distanceToCenter,
            viewer.resolutionScale,
            new Cartesian2(),
          ),
          lastUpdate: Date.now(),
          lastUpdateHeight,
          positions,
          camera: cameraState,
        };

        onSceneStateUpdate();
      } catch (error) {
        console.error("updateSceneState: error", error);
      } finally {
        isUpdatingRef.current = false;
      }
    };

    if (cameraPercentageChanged) {
      originalCameraPercentageChangedRef.current = camera.percentageChanged;
      camera.percentageChanged = cameraPercentageChanged;
    }
    const listener = camera.changed.addEventListener(updateSceneState);

    // Initial call
    updateSceneState();

    return () => {
      //scene.postUpdate.removeEventListener(listener);
      camera.changed.removeEventListener(listener);
      if (
        cameraPercentageChanged &&
        originalCameraPercentageChangedRef.current
      ) {
        camera.percentageChanged = originalCameraPercentageChangedRef.current;
        originalCameraPercentageChangedRef.current = null;
      }
    };
  }, [
    viewer,
    sceneStateRef,
    cameraPercentageChanged,
    surfaceProvider,
    terrainProvider,
    onSceneStateUpdate,
  ]);
};

export default useSceneStateUpdater;
