import { useMemo, useCallback } from "react";
import {
  Math as CesiumMath,
  OrthographicFrustum,
  PerspectiveFrustum,
} from "cesium";

import { useTweakpaneCtx } from "@carma-commons/debug";
import { resolutionFractionsAscending } from "@carma-commons/constants";

import { useCesiumContext } from "./useCesiumContext";
import { formatFractions } from "../utils/formatters";
import { CtxEvent } from "../cesiumContextEventMap";

const useDebug = () => {
  const {
    sceneRef,
    viewerRef,
    isViewerReady,
    minZoomDistanceRef,
    maxZoomDistanceRef,
    enableCollisionDetectionRef,
    emit,
  } = useCesiumContext();

  const minZoomDistance = minZoomDistanceRef.current;
  const maxZoomDistance = maxZoomDistanceRef.current;
  const collisions = enableCollisionDetectionRef.current;

  const setMaxZoomDistance = useCallback(
    (v: number) => {
      maxZoomDistanceRef.current = v;
      emit(CtxEvent.SetMaxZoomDistance, v);
    },
    [maxZoomDistanceRef, emit]
  );
  const setMinZoomDistance = useCallback(
    (v: number) => {
      minZoomDistanceRef.current = v;
      emit(CtxEvent.SetMinZoomDistance, v);
    },
    [minZoomDistanceRef, emit]
  );
  const setCollisions = useCallback(
    (v: boolean) => {
      enableCollisionDetectionRef.current = v;
      emit(CtxEvent.SetEnableCollisionDetection, v);
    },
    [enableCollisionDetectionRef, emit]
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
              (sceneRef?.current?.camera?.frustum as PerspectiveFrustum)?.fov ||
              1.0
            );
          },

          set fov(value: number) {
            const scene = sceneRef?.current;
            if (
              scene &&
              scene.camera?.frustum instanceof PerspectiveFrustum &&
              !Number.isNaN(value)
            ) {
              scene.camera.frustum.fov = value;
            }
          },
          get orthographic() {
            const scene = sceneRef.current;
            return scene?.camera.frustum instanceof OrthographicFrustum;
          },
          set orthographic(value: boolean) {
            const scene = sceneRef.current;
            if (scene) {
              if (value && scene.camera.frustum instanceof PerspectiveFrustum) {
                scene.camera.switchToOrthographicFrustum();
              } else if (scene.camera.frustum instanceof OrthographicFrustum) {
                scene.camera.switchToPerspectiveFrustum();
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
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [isViewerReady, sceneRef]
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
            const viewer = viewerRef.current;
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
            const viewer = viewerRef.current;
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
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [isViewerReady, viewerRef]
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
