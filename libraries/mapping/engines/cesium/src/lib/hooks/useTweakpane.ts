import { useDispatch, useSelector } from "react-redux";
import {
  Math as CesiumMath,
  OrthographicFrustum,
  PerspectiveFrustum,
} from "cesium";

import { useTweakpaneCtx } from "@carma-commons/debug";

import { formatFractions } from "../utils/formatters";
import { resolutionFractions } from "../utils/cesiumHelpers";

import { useCesiumContext } from "../CesiumContextProvider";
import {
  setScreenSpaceCameraControllerEnableCollisionDetection,
  setScreenSpaceCameraControllerMaximumZoomDistance,
  setScreenSpaceCameraControllerMinimumZoomDistance,
  selectScreenSpaceCameraControllerEnableCollisionDetection,
  selectScreenSpaceCameraControllerMaximumZoomDistance,
  selectScreenSpaceCameraControllerMinimumZoomDistance,
} from "../slices/cesium";

const useTweakpane = () => {
  const { viewer } = useCesiumContext();

  const dispatch = useDispatch();

  const minZoomDistance = useSelector(
    selectScreenSpaceCameraControllerMinimumZoomDistance,
  );
  const maxZoomDistance = useSelector(
    selectScreenSpaceCameraControllerMaximumZoomDistance,
  );
  const collisions = useSelector(
    selectScreenSpaceCameraControllerEnableCollisionDetection,
  );

  const setMaxZoomDistance = (v: number) =>
    dispatch(setScreenSpaceCameraControllerMaximumZoomDistance(v));
  const setMinZoomDistance = (v: number) =>
    dispatch(setScreenSpaceCameraControllerMinimumZoomDistance(v));
  const setCollisions = (v: boolean) =>
    dispatch(setScreenSpaceCameraControllerEnableCollisionDetection(v));

  useTweakpaneCtx(
    {
      title: "Camera Settings",
    },
    {
      get fov() {
        return (viewer?.scene.camera.frustum as PerspectiveFrustum)?.fov || 1.0;
      },

      set fov(value: number) {
        if (
          viewer &&
          viewer.scene.camera.frustum instanceof PerspectiveFrustum &&
          !Number.isNaN(value)
        ) {
          viewer.scene.camera.frustum.fov = value;
        }
      },
      get orthographic() {
        return viewer?.scene.camera.frustum instanceof OrthographicFrustum;
      },
      set orthographic(value: boolean) {
        if (viewer) {
          if (
            value &&
            viewer.scene.camera.frustum instanceof PerspectiveFrustum
          ) {
            viewer.scene.camera.switchToOrthographicFrustum();
          } else if (
            viewer.scene.camera.frustum instanceof OrthographicFrustum
          ) {
            viewer.scene.camera.switchToPerspectiveFrustum();
          }
        }
      },
    },

    [
      {
        name: "fov",
        label: "FOV",
        min: Math.PI / 400,
        max: Math.PI,
        step: 0.01,
        format: (v) => `${parseFloat(CesiumMath.toDegrees(v).toFixed(2))}°`,
      },
      {
        name: "orthographic",
        label: "Orthographic",
        type: "boolean",
      },
    ],
  );

  useTweakpaneCtx(
    {
      title: "Scene Settings",
    },
    {
      get resolutionScale() {
        // Find the closest value in the array to the current resolutionScale and return its index
        const currentValue = viewer ? viewer.resolutionScale : 1;
        const closestIndex = resolutionFractions.findIndex(
          (value) => value === currentValue,
        );
        return closestIndex !== -1
          ? closestIndex
          : resolutionFractions.length - 1; // Default to the last index if not found
      },
      set resolutionScale(index) {
        // Use the index to set the resolutionScale from the array
        if (viewer && index >= 0 && index < resolutionFractions.length) {
          const value = resolutionFractions[index];
          viewer.resolutionScale = value;
        }
      },
    },

    [
      {
        name: "resolutionScale",
        min: 0, // The minimum index
        max: resolutionFractions.length - 1, // The maximum index
        step: 1, // Step by index
        format: (v: number) => formatFractions(resolutionFractions[v]),
      },
    ],
  );

  useTweakpaneCtx(
    {
      title: "Scene Camera Controller",
    },
    {
      get maxZoomDistance() {
        return maxZoomDistance;
      },
      set maxZoomDistance(value: number) {
        if (!isNaN(value)) {
          // TODO add debounce for all Setters
          setMaxZoomDistance(value);
        }
      },
      get minZoomDistance() {
        return minZoomDistance;
      },
      set minZoomDistance(value: number) {
        if (!isNaN(value)) {
          setMinZoomDistance(value);
        }
      },

      get collisions() {
        return collisions;
      },
      set collisions(v: boolean) {
        setCollisions(v);
      },
    },
    [
      { name: "collisions" },
      { name: "maxZoomDistance", min: 1000, max: 1000000, step: 1000 },
      { name: "minZoomDistance", min: 10, max: 1000, step: 10 },
    ],
  );
};

export default useTweakpane;
