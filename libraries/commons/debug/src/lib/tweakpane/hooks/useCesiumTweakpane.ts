import { useMemo } from "react";
import {
  Math as CesiumMath,
  OrthographicFrustum,
  PerspectiveFrustum,
} from "cesium";

import { useCesiumContext } from "@carma-mapping/cesium-engine";
import { resolutionFractions } from "@carma-commons/utils";
import { useTweakpaneCtx } from "./useTweakpaneContext";
import { formatFractions } from "../../../../../utils/src";

const useTweakpane = () => {
  const { viewerRef } = useCesiumContext();

  useTweakpaneCtx(
    useMemo(
      () => ({
        folder: {
          title: "Camera Settings",
        },
        params: {
          get fov() {
            return (
              (viewerRef.current?.scene.camera.frustum as PerspectiveFrustum)
                ?.fov || 1.0
            );
          },

          set fov(value: number) {
            if (
              viewerRef.current &&
              viewerRef.current.scene.camera.frustum instanceof
                PerspectiveFrustum &&
              !Number.isNaN(value)
            ) {
              viewerRef.current.scene.camera.frustum.fov = value;
            }
          },
          get orthographic() {
            return (
              viewerRef.current?.scene.camera.frustum instanceof
              OrthographicFrustum
            );
          },
          set orthographic(value: boolean) {
            const viewer = viewerRef.current;
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
      [viewerRef]
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
            const viewer = viewerRef.current;
            // Find the closest value in the array to the current resolutionScale and return its index
            const currentValue = viewer ? viewer.resolutionScale : 1;
            const closestIndex = resolutionFractions.findIndex(
              (value) => value === currentValue
            );
            return closestIndex !== -1
              ? closestIndex
              : resolutionFractions.length - 1; // Default to the last index if not found
          },
          set resolutionScale(index) {
            const viewer = viewerRef.current;
            // Use the index to set the resolutionScale from the array
            if (viewer && index >= 0 && index < resolutionFractions.length) {
              const value = resolutionFractions[index];
              console.debug("HOOK: [TWEAKPANE] resolutionScale", index, value);
              viewer.resolutionScale = value ?? 1;
            }
          },
        },
        inputs: [
          {
            name: "resolutionScale",
            min: 0, // The minimum index
            max: resolutionFractions.length - 1, // The maximum index
            step: 1, // Step by index
            format: (v: number) => formatFractions(resolutionFractions[v]),
          },
        ],
      }),
      [viewerRef]
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
            return (
              viewerRef.current?.scene.screenSpaceCameraController
                .maximumZoomDistance ?? 1000000
            );
          },
          set maxZoomDistance(value: number) {
            if (
              viewerRef.current?.scene.screenSpaceCameraController &&
              !isNaN(value)
            ) {
              viewerRef.current.scene.screenSpaceCameraController.maximumZoomDistance =
                value;
            }
          },
          get minZoomDistance() {
            return (
              viewerRef.current?.scene.screenSpaceCameraController
                .minimumZoomDistance ?? 10
            );
          },
          set minZoomDistance(value: number) {
            if (
              viewerRef.current?.scene.screenSpaceCameraController &&
              !isNaN(value)
            ) {
              viewerRef.current.scene.screenSpaceCameraController.minimumZoomDistance =
                value;
            }
          },
          get collisions() {
            return (
              viewerRef.current?.scene.screenSpaceCameraController
                .enableCollisionDetection ?? false
            );
          },
          set collisions(v: boolean) {
            if (viewerRef.current?.scene.screenSpaceCameraController) {
              viewerRef.current.scene.screenSpaceCameraController.enableCollisionDetection =
                v;
            }
          },
        },
        inputs: [
          { name: "collisions" },
          { name: "maxZoomDistance", min: 1000, max: 1000000, step: 1000 },
          { name: "minZoomDistance", min: 10, max: 1000, step: 10 },
        ],
      }),
      []
    )
  );
};

export default useTweakpane;
