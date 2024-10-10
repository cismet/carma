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
} from "cesium";

enum SampledPositions {
  UnderCamera,
  ScreenCenter,
}

export interface SampledPosition {
  type: SampledPositions;
  pickedPosition: Cartesian3 | null;
  height: Cartographic;
  heightMostDetailed: Cartographic | null;
  pixelSize: number | null;
}

export interface Positions {
  underCamera: SampledPosition;
  screenCenter: SampledPosition;
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
}

const SAMPLE_BOUNDING_SPHERE_RADIUS = 10;

const sampleBoundingSphere = new BoundingSphere(
  Cartesian3.ZERO,
  SAMPLE_BOUNDING_SPHERE_RADIUS,
); // to be reused for all terrain samples

const useSceneStateUpdater = (
  viewer: Viewer | null,
  sceneStateRef: MutableRefObject<SceneState | null>,
) => {
  const frameIndexRef = useRef<number>(0);

  useEffect(() => {
    if (!viewer) return;
    const { scene, camera } = viewer;
    const sampleHeightSceneObjectsToExclude = [scene.globe.ellipsoid]; // TODO dynamically add markers and symbolic objects here
    const updateSceneState = async () => {
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
            height: Object.assign(cameraState.positionCartographic, {
              height: underCameraSampledHeight,
            }),
            pixelSize: null,
            pickedPosition: null,
            heightMostDetailed: null,
          },
          screenCenter: {
            type: SampledPositions.ScreenCenter,
            pickedPosition: centerPosition,
            height: Object.assign(centerPositionCartographic, {
              height: centerSampledHeight,
            }),
            heightMostDetailed: null,
            pixelSize: null,
          },
        };

        const lastUpdateHeight = Date.now();

        // This takes ~100ms vs 5 with the non async version 
        /* 
        const sampledHeightsMostDetailed = await scene.sampleHeightMostDetailed(
          [cameraState.positionCartographic, centerPositionCartographic],
          sampleHeightSceneObjectsToExclude,
          SAMPLE_BOUNDING_SPHERE_RADIUS,
        );

        const [underCameraHeightMostDetailed, centerHeightMostDetailed] =
          sampledHeightsMostDetailed;

        if (defined(underCameraHeightMostDetailed)) {
          positions.underCamera.heightMostDetailed =
            underCameraHeightMostDetailed;
        } else {
          console.log("nulling under camera height most detailed");
        }

        if (defined(centerHeightMostDetailed)) {
          positions.screenCenter.heightMostDetailed = centerHeightMostDetailed;
        } else {
          console.log("nulling screen center height most detailed");
        }
        */

        sceneStateRef.current = {
          ...newState,
          lastUpdate: Date.now(),
          lastUpdateHeight,
          positions,
          camera: cameraState,
        };
        console.info(
          "update Scene State",
          sceneStateRef.current.frameIndex,
          sceneStateRef.current.lastUpdate - sceneStateRef.current.lastUpdateStart
        );
      } catch (error) {
        console.error("Error updating scene state:", error);
        // TODO handle error
        /*
        setSceneState((prev: SceneState) => ({
          ...prev,
          lastUpdate: Date.now(),
          frameIndex: frameIndexRef.current + 1,
          camera: {
            position: null,
            orientation: null,
            frustum: null,
          },
          positions: {
            underCamera: null,
            screenCenter: null,
          },
        }));
        */
      }
    };

    const listener = scene.postUpdate.addEventListener(updateSceneState);

    // Initial call
    updateSceneState();

    return () => {
      scene.postUpdate.removeEventListener(listener);
    };
  }, [viewer, sceneStateRef]);
};

export default useSceneStateUpdater;
