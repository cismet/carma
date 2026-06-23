import { MutableRefObject, useEffect, useRef, useMemo } from "react";

import {
  Color,
  ColorGeometryInstanceAttribute,
  GeometryInstance,
  GroundPolylineGeometry,
  GroundPolylinePrimitive,
  PolylineColorAppearance,
  type Cartesian3,
  type Scene,
} from "@carma-cesium";
import { Easing } from "@carma-commons/math";

import {
  COLORS,
  UnitRgba,
  useMemoMergedDefaultOptions,
} from "@carma-commons/utils";
import {
  useCesiumContext,
  polygonHierarchyFromPolygonCoords,
} from "@carma-mapping/engines/cesium/react/runtime";

import { useOblique } from "../hooks/useOblique";
import {
  findMatchingFeature,
  type FootprintFeature,
} from "../utils/footprintUtils";
import type { ObliqueFootprintsStyle } from "../types";
import {
  AnimationState,
  createAnimationState,
  processAnimation,
  startAnimation,
} from "../utils/animateUnitValue";

type OpacityAnimationState = AnimationState<number>;

const FOOTPRINT_OUTLINE_ID = "oblq-footprint-outline";

const defaultFootprintsStyle: ObliqueFootprintsStyle = {
  outlineColor: COLORS.WHITE,
  outlineWidth: 5,
  outlineOpacity: 1,
};

const writeOutlinePrimitiveColor = (
  primitive: GroundPolylinePrimitive,
  color: Color
) => {
  try {
    const attributes =
      primitive.getGeometryInstanceAttributes(FOOTPRINT_OUTLINE_ID);
    if (attributes) {
      attributes.color = ColorGeometryInstanceAttribute.toValue(color);
    }
  } catch {
    // Primitive attributes are unavailable until the primitive is added/ready.
  }
};

const cleanupOutlinePrimitive = (
  scene: Scene | null,
  ref: MutableRefObject<GroundPolylinePrimitive | null>,
  debug = false,
  requestRender?: () => void
) => {
  debug && console.debug(`Oblique Footprints: Removing outline primitive`);
  try {
    const primitive = ref.current;
    const { groundPrimitives } = scene ?? {};
    if (
      groundPrimitives &&
      !groundPrimitives.isDestroyed() &&
      primitive &&
      groundPrimitives.contains(primitive)
    ) {
      groundPrimitives.remove(primitive);
    }
  } catch (e) {
    console.error("Error removing outline primitive", e);
  }
  ref.current = null;
  requestRender?.();
};

const createOutlinePrimitive = ({
  positions,
  color,
  width,
}: {
  positions: Cartesian3[];
  color: Color;
  width: number;
}) => {
  const outlinePositions = [...positions, positions[0]];

  return new GroundPolylinePrimitive({
    geometryInstances: new GeometryInstance({
      id: FOOTPRINT_OUTLINE_ID,
      geometry: new GroundPolylineGeometry({
        positions: outlinePositions,
        width,
      }),
      attributes: {
        color: ColorGeometryInstanceAttribute.fromColor(color),
      },
    }),
    appearance: new PolylineColorAppearance(),
    show: true,
    debugShowBoundingVolume: false,
  });
};

export const useFootprints = (debug = false): void => {
  const { requestRender, isValidRuntime, getScene } = useCesiumContext();
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
      cleanupOutlinePrimitive(
        getScene(),
        outlinePrimitiveRef,
        debug,
        requestRender
      );
    };
  }, [debug, getScene, requestRender]);

  useEffect(() => {
    // If we're leaving oblique mode, trigger exit animation then clean up the footprint
    if (prevObliqueMode.current && !isObliqueMode) {
      // Always clean up the outline immediately
      cleanupOutlinePrimitive(
        getScene(),
        outlinePrimitiveRef,
        debug,
        requestRender
      );
    }
    prevObliqueMode.current = isObliqueMode;
  }, [isObliqueMode, getScene, debug, requestRender]);

  useEffect(() => {
    opacityAnimationRef.current.duration = animationDuration;
    opacityAnimationRef.current.delay = animationDelay;
    opacityAnimationRef.current.easingFunction = animationEasing;
  }, [animationDuration, animationDelay, animationEasing]);

  useEffect(() => {
    // When lockFootprint is set, start fade-out animation with a completion callback to clean up.
    const scene = getScene();
    const primitive = outlinePrimitiveRef.current;
    if (scene && primitive) {
      if (lockFootprint) {
        startAnimation(opacityAnimationRef.current, outlineOpacity, 0.0, {
          forceStart: true,
          onComplete: () => {
            cleanupOutlinePrimitive(
              scene,
              outlinePrimitiveRef,
              debug,
              requestRender
            );
            lastImageIdRef.current = null;
          },
        });

        const updateOpacity = () => {
          const opacity = processAnimation(
            opacityAnimationRef.current,
            requestRender
          );
          writeOutlinePrimitiveColor(primitive, outlineColor.withAlpha(opacity));
          if (!opacityAnimationRef.current.isAnimating) {
            scene.postRender.removeEventListener(updateOpacity);
          }
        };

        scene.postRender.addEventListener(updateOpacity);
        requestRender();

        return () => {
          scene.postRender.removeEventListener(updateOpacity);
        };
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
    if (
      !isValidRuntime() ||
      !selectedImage ||
      !footprintData ||
      !isObliqueMode
    ) {
      return;
    }

    const scene = getScene();
    if (!scene) {
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

    const matchingFeature = findMatchingFeature(
      footprintData.features as FootprintFeature[],
      selectedImage.record.id
    );

    if (!matchingFeature) return;

    // Extract polygon coordinates from the feature
    const polygonCoords = matchingFeature.geometry.coordinates.map((ring) =>
      ring.map((coord) => [coord[0], coord[1]])
    );

    // Get polygon hierarchy for the footprint primitive
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

      debug && console.debug(`Oblique Footprints: Creating outline primitive`);
      const outlinePrimitive = createOutlinePrimitive({
        positions: polygonHierarchy.positions,
        color: outlineColor.withAlpha(outlineOpacity),
        width: outlineWidth,
      });
      scene.groundPrimitives.add(outlinePrimitive);
      outlinePrimitiveRef.current = outlinePrimitive;
      requestRender();
    }
  }, [
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
    isValidRuntime,
    requestRender,
    getScene,
  ]);
};

export default useFootprints;
