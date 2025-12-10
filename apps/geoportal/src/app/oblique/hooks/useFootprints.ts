import { MutableRefObject, useEffect, useRef, useMemo } from "react";

import {
  Color,
  type Cartesian3,
  GroundPolylinePrimitive,
  GroundPolylineGeometry,
  GeometryInstance,
  Material,
  isValidScene,
  type Scene,
  type PrimitiveCollection,
} from "@carma/cesium";
import { Easing } from "@carma-commons/math";

import {
  COLORS,
  UnitRgba,
  useMemoMergedDefaultOptions,
} from "@carma-commons/utils";
import {
  useCesiumContext,
  polygonHierarchyFromPolygonCoords,
} from "@carma-mapping/engines/cesium";

import { useOblique } from "../hooks/useOblique";
import {
  findMatchingFeature,
  type FootprintFeature,
} from "../utils/footprintUtils";
import type { ObliqueFootprintsStyle } from "../types";
import {
  AnimationState,
  createAnimationState,
  startAnimation,
} from "../utils/animateUnitValue";

type OpacityAnimationState = AnimationState<number>;

const defaultFootprintsStyle: ObliqueFootprintsStyle = {
  outlineColor: COLORS.WHITE,
  outlineWidth: 5,
  outlineOpacity: 1,
};

const cleanupOutlinePrimitive = (
  scene: Scene | null,
  ref: MutableRefObject<GroundPolylinePrimitive | null>,
  debug = false,
  requestRender?: () => void
) => {
  debug && console.debug(`Oblique Footprints: Removing outline primitive`);
  try {
    if (isValidScene(scene) && ref.current) {
      const primitives = scene.groundPrimitives as PrimitiveCollection;
      if (primitives.contains(ref.current)) {
        primitives.remove(ref.current);
      }
    }
  } catch (e) {
    console.error("Error removing outline primitive", e);
  }
  ref.current = null;
  requestRender?.();
};

export const useFootprints = (debug = false): void => {
  const { requestRender, getScene } = useCesiumContext();
  const {
    isObliqueMode,
    selectedImage,
    footprintData,
    lockFootprint,
    animations,
    footprintsStyle,
  } = useOblique();

  const {
    outlineColor: outlineColorRaw,
    outlineOpacity,
    outlineWidth,
  } = useMemoMergedDefaultOptions(footprintsStyle, defaultFootprintsStyle);

  // Convert UnitRgba to Cesium Color
  const outlineColor = useMemo(
    () =>
      outlineColorRaw instanceof Color
        ? outlineColorRaw
        : new Color(...(outlineColorRaw as UnitRgba)),
    [outlineColorRaw]
  );

  const animationDuration = animations?.outlineFadeOut?.duration ?? 1000;
  const animationDelay = animations?.outlineFadeOut?.delay ?? 0;
  const animationEasing =
    animations?.outlineFadeOut?.easingFunction || Easing.LINEAR_NONE;

  const lastImageIdRef = useRef<string | null>(null);
  const outlinePrimitiveRef = useRef<GroundPolylinePrimitive | null>(null);
  const prevObliqueMode = useRef<boolean>(isObliqueMode);

  const opacityAnimationRef = useRef<OpacityAnimationState>(
    createAnimationState({
      startValue: outlineOpacity,
      targetValue: outlineOpacity,
      duration: animationDuration,
      delay: animationDelay,
      easingFunction: animationEasing,
    })
  );

  // Clean up primitives when component unmounts
  useEffect(() => {
    return () => {
      const scene = getScene();
      cleanupOutlinePrimitive(scene, outlinePrimitiveRef, debug, requestRender);
    };
  }, [debug, getScene, requestRender]);

  useEffect(() => {
    // If we're leaving oblique mode, trigger exit animation then clean up the footprint
    if (prevObliqueMode.current && !isObliqueMode) {
      // Always clean up the outline immediately
      const scene = getScene();
      cleanupOutlinePrimitive(scene, outlinePrimitiveRef, debug, requestRender);
    }
    prevObliqueMode.current = isObliqueMode;
  }, [isObliqueMode, getScene, debug, requestRender]);

  useEffect(() => {
    opacityAnimationRef.current.duration = animationDuration;
    opacityAnimationRef.current.delay = animationDelay;
    opacityAnimationRef.current.easingFunction = animationEasing;
  }, [animationDuration, animationDelay, animationEasing]);

  useEffect(() => {
    // When lockFootprint is set, start fade-out animation with a completion callback to clean up
    if (outlinePrimitiveRef.current) {
      if (lockFootprint) {
        startAnimation(opacityAnimationRef.current, outlineOpacity, 0.0, {
          forceStart: true,
          onComplete: () => {
            // Remove primitive completely when animation finishes
            const scene = getScene();
            cleanupOutlinePrimitive(
              scene,
              outlinePrimitiveRef,
              debug,
              requestRender
            );
            lastImageIdRef.current = null;
          },
        });
      } else if (lastImageIdRef.current === null && selectedImage) {
        // Coming back from locked state - we'll recreate the primitive
        // by setting last ref to null to force the next effect to run
        lastImageIdRef.current = null;
      }
    }
    requestRender();
  }, [
    lockFootprint,
    outlineOpacity,
    outlineColor,
    selectedImage,
    debug,
    requestRender,
    getScene,
  ]);

  useEffect(() => {
    const scene = getScene();
    if (
      !isValidScene(scene) ||
      !selectedImage ||
      !footprintData ||
      !isObliqueMode
    ) {
      return;
    }

    // If footprint is locked, don't create a new primitive
    if (lockFootprint) {
      return;
    }

    const currentImageId = selectedImage.record.id;
    const sameImage = lastImageIdRef.current === currentImageId;

    // Only clean up and recreate primitive if:
    // 1. It's a new image
    // 2. We don't already have a primitive
    if (sameImage && outlinePrimitiveRef.current) {
      // If it's the same image and we already have a primitive, no need to recreate
      return;
    }

    lastImageIdRef.current = currentImageId;

    // Clean up any existing primitive
    cleanupOutlinePrimitive(scene, outlinePrimitiveRef, debug, requestRender);

    const createOutlinePrimitive = (positions: Cartesian3[]) => {
      if (!positions || positions.length === 0) return null;

      // Close the loop by adding the first position to the end
      const outlinePositions = [...positions, positions[0]];

      debug && console.debug(`Oblique Footprints: Creating outline primitive`);

      const geometryInstance = new GeometryInstance({
        geometry: new GroundPolylineGeometry({
          positions: outlinePositions,
          width: outlineWidth,
        }),
      });

      return new GroundPolylinePrimitive({
        geometryInstances: geometryInstance,
        appearance: {
          material: Material.fromType("Color", {
            color: outlineColor.withAlpha(outlineOpacity),
          }),
        } as unknown as undefined, // PolylineMaterialAppearance type workaround
        asynchronous: false,
      });
    };

    const matchingFeature = findMatchingFeature(
      footprintData.features as FootprintFeature[],
      selectedImage.record.id
    );

    if (!matchingFeature) return;

    // Extract polygon coordinates from the feature
    const polygonCoords = matchingFeature.geometry.coordinates.map((ring) =>
      ring.map((coord) => [coord[0], coord[1]])
    );

    // Get polygon hierarchy for use in primitive
    const polygonHierarchy = polygonHierarchyFromPolygonCoords(polygonCoords);

    if (polygonHierarchy.positions && polygonHierarchy.positions.length > 0) {
      // Create fresh animation state for this primitive
      opacityAnimationRef.current = createAnimationState({
        startValue: outlineOpacity,
        targetValue: outlineOpacity,
        duration: animationDuration,
        delay: animationDelay,
        easingFunction: animationEasing,
      });

      const outlinePrimitive = createOutlinePrimitive(
        polygonHierarchy.positions
      );
      if (outlinePrimitive) {
        const primitives = scene.groundPrimitives as PrimitiveCollection;
        primitives.add(outlinePrimitive);
        outlinePrimitiveRef.current = outlinePrimitive;
      }
    }
  }, [
    getScene,
    isObliqueMode,
    selectedImage,
    footprintData,
    outlineWidth,
    outlineColor,
    outlineOpacity,
    lockFootprint,
    animationDuration,
    animationDelay,
    animationEasing,
    debug,
    requestRender,
  ]);
};

export default useFootprints;
