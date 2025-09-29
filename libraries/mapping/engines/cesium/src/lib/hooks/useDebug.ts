import { useMemo, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  Math as CesiumMath,
  OrthographicFrustum,
  PerspectiveFrustum,
} from "cesium";

import { useTweakpaneCtx } from "@carma-commons/debug";
import { resolutionFractionsAscending } from "@carma-commons/utils";

import { formatFractions } from "../utils/formatters";

import { useCesiumViewer } from "./useCesiumViewer";
import {
  setScreenSpaceCameraControllerEnableCollisionDetection,
  setScreenSpaceCameraControllerMaximumZoomDistance,
  setScreenSpaceCameraControllerMinimumZoomDistance,
  selectScreenSpaceCameraControllerEnableCollisionDetection,
  selectScreenSpaceCameraControllerMaximumZoomDistance,
  selectScreenSpaceCameraControllerMinimumZoomDistance,
} from "../slices/cesium";

const useDebug = () => {
  const viewer = useCesiumViewer();

  const dispatch = useDispatch();

  const minZoomDistance = useSelector(
    selectScreenSpaceCameraControllerMinimumZoomDistance
  );
  const maxZoomDistance = useSelector(
    selectScreenSpaceCameraControllerMaximumZoomDistance
  );
  const collisions = useSelector(
    selectScreenSpaceCameraControllerEnableCollisionDetection
  );

  const setMaxZoomDistance = useCallback(
    (v: number) =>
      dispatch(setScreenSpaceCameraControllerMaximumZoomDistance(v)),
    [dispatch]
  );
  const setMinZoomDistance = useCallback(
    (v: number) =>
      dispatch(setScreenSpaceCameraControllerMinimumZoomDistance(v)),
    [dispatch]
  );
  const setCollisions = useCallback(
    (v: boolean) =>
      dispatch(setScreenSpaceCameraControllerEnableCollisionDetection(v)),
    [dispatch]
  );

  useTweakpaneCtx(
    useMemo(
      () => ({
        folder: {
          title: "Camera Settings",
        },
        params: {
          get fov() {
            return (
              (viewer?.scene.camera.frustum as PerspectiveFrustum)?.fov || 1.0
            );
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
        inputs: [
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
      }),
      [viewer]
    )
  );

  useTweakpaneCtx(
    useMemo(
      () => ({
        folder: {
          title: "Scene Settings",
        },
        params: {
          get resolutionScale() {
            // Find the closest value in the array to the current resolutionScale and return its index
            const currentValue = viewer ? viewer.resolutionScale : 1;
            const closestIndex = resolutionFractionsAscending.findIndex(
              (value) => value === currentValue
            );
            return closestIndex !== -1
              ? closestIndex
              : resolutionFractionsAscending.length - 1; // Default to the last index if not found
          },
          set resolutionScale(index) {
            // Use the index to set the resolutionScale from the array
            if (
              viewer &&
              index >= 0 &&
              index < resolutionFractionsAscending.length
            ) {
              const value = resolutionFractionsAscending[index];
              console.debug("HOOK: [TWEAKPANE] resolutionScale", index, value);
              viewer.resolutionScale = value ?? 1;
            }
          },
        },
        inputs: [
          {
            name: "resolutionScale",
            min: 0, // The minimum index
            max: resolutionFractionsAscending.length - 1, // The maximum index
            step: 1, // Step by index
            format: (v: number) =>
              formatFractions(resolutionFractionsAscending[v]),
          },
        ],
      }),
      [viewer]
    )
  );

  useTweakpaneCtx(
    useMemo(
      () => ({
        folder: {
          title: "Scene Camera Controller",
        },
        params: {
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
        inputs: [
          { name: "collisions" },
          { name: "maxZoomDistance", min: 1000, max: 1000000, step: 1000 },
          { name: "minZoomDistance", min: 10, max: 1000, step: 10 },
        ],
      }),
      [
        minZoomDistance,
        maxZoomDistance,
        collisions,
        setMinZoomDistance,
        setMaxZoomDistance,
        setCollisions,
      ]
    )
  );
};

export default useDebug;
