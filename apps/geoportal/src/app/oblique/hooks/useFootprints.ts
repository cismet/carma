import { MutableRefObject, useEffect, useRef } from "react";
import { useSelector } from "react-redux";

import {
  Color,
  ColorMaterialProperty,
  ConstantProperty,
  Entity,
  CallbackProperty,
  EasingFunction,
  PolylineGraphics,
  Math as CesiumMath,
  type Cartesian3,
  Viewer,
  defined,
} from "cesium";

import { useFeatureFlags } from "@carma-apps/portals";
import {
  useCesiumContext,
  polygonHierarchyFromPolygonCoords,
  cesiumSafeRequestRender,
  isValidViewerInstance,
} from "@carma-mapping/cesium-engine";

import { useOblique } from "./useOblique";

import type { FootprintFeature } from "../utils/footprintUtils";
import { findMatchingFeature } from "../utils/footprintUtils";

interface AnimationState<T> {
  isAnimating: boolean;
  startTime: number | null;
  startValue: T;
  targetValue: T;
  onComplete?: () => void;
  duration: number;
  delay?: number;
  easingFunction: (time: number) => number;
}

type OpacityAnimationState = AnimationState<number>;

const OBLIQUE_DATASOURCE_PREFIX = "oblq-footprint";
const FOOTPRINT_OUTLINE_ID = "oblq-footprint-outline";
const DEFAULT_ANIMATION_DURATION = 500; // milliseconds
const OUTLINE_WIDTH = 2; // Width for the outline in pixels

function createAnimationState<T>(
  params: Partial<AnimationState<T>> & { startValue: T; targetValue: T }
): AnimationState<T> {
  return {
    isAnimating: false,
    startTime: null,
    duration: DEFAULT_ANIMATION_DURATION,
    delay: 0,
    easingFunction: EasingFunction.LINEAR_NONE,
    ...params,
  };
}

/**
 * Generic animation processor that updates an animation state and returns the interpolated value
 */
function processAnimation<T extends number>(
  animState: AnimationState<T>,
  viewer: unknown
): T {
  if (!animState.isAnimating || animState.startTime === null) {
    return animState.targetValue;
  }

  const elapsed =
    performance.now() - animState.startTime - (animState.delay || 0);
  const duration = animState.duration;
  const progress = CesiumMath.clamp(elapsed / duration, 0, 1);
  const easedProgress = animState.easingFunction(progress);
  // Calculate interpolated value
  const newValue =
    animState.startValue +
    (animState.targetValue - animState.startValue) * easedProgress;

  // Check for animation completion
  if (progress >= 1) {
    animState.isAnimating = false;
    animState.onComplete && animState.onComplete();
  }

  cesiumSafeRequestRender(viewer);

  return newValue as T;
}

/**
 * Starts an animation with the provided parameters
 */
function startAnimation<T extends number>(
  animState: AnimationState<T>,
  startValue: T,
  targetValue: T,
  options?: Partial<AnimationState<T>>
): void {
  // Skip animation if the values are already very close
  if (Math.abs(startValue - targetValue) < 0.1) {
    animState.targetValue = targetValue;
    animState.isAnimating = false;
    return;
  }

  animState.startValue = startValue;
  animState.targetValue = targetValue;
  animState.startTime = performance.now();
  animState.isAnimating = true;

  // Apply any additional options
  if (options) {
    Object.assign(animState, options);
  }
}

const cleanupOutlineEntity = (
  viewer: Viewer,
  ref: MutableRefObject<Entity | null>
) => {
  if (isValidViewerInstance(viewer) && defined(viewer.entities)) {
    viewer.entities.removeById(FOOTPRINT_OUTLINE_ID);
    ref.current = null;
  }
};

export const useFootprints = (): void => {
  const { viewerRef } = useCesiumContext();
  const {
    isObliqueMode,
    nearestImage,
    footprintData,
    lockFootprint,
    animations,
  } = useOblique();

  const featureFlags = useFeatureFlags();
  const { featureFlagDebugOblique: isDebug } = featureFlags;

  const animationDuration = animations?.outlineFadeOut?.duration ?? 1000;
  const animationDelay = animations?.outlineFadeOut?.delay ?? 0;
  const animationEasing =
    animations?.outlineFadeOut?.easingFunction || EasingFunction.LINEAR_NONE;

  // Common refs
  const lastImageIdRef = useRef<string | null>(null);
  const outlineEntityRef = useRef<Entity | null>(null);
  const polygonPositionsRef = useRef<Cartesian3[]>([]);
  const prevObliqueMode = useRef<boolean>(isObliqueMode);

  const opacityAnimationRef = useRef<OpacityAnimationState>(
    createAnimationState({
      startValue: 1.0,
      targetValue: 1.0,
      duration: animationDuration,
      delay: animationDelay,
      easingFunction: animationEasing,
    })
  );

  const cleanupEntities = (viewer: Viewer) => {
    cleanupOutlineEntity(viewer, outlineEntityRef);
    cesiumSafeRequestRender(viewer);
  };

  const createOpacityCallbackProperty = () => {
    return new CallbackProperty(() => {
      const newOpacity = processAnimation(
        opacityAnimationRef.current,
        viewerRef.current
      );

      // If opacity is 0, hide the outline entity completely
      if (Math.abs(newOpacity) < 0.01 && outlineEntityRef.current) {
        outlineEntityRef.current.show = false;
      }

      return Color.WHITE.withAlpha(newOpacity);
    }, false);
  };

  // Clean up entities when component unmounts
  useEffect(() => {
    // Clean up entities when the component unmounts
    const viewer = viewerRef.current;
    return () => {
      cleanupEntities(viewer);
    };
  }, []);

  useEffect(() => {
    // If we're leaving oblique mode, trigger exit animation then clean up the footprint
    if (prevObliqueMode.current && !isObliqueMode) {
      // Always clean up the outline immediately
      cleanupEntities(viewerRef.current);
    }
    prevObliqueMode.current = isObliqueMode;
  }, [isObliqueMode, viewerRef]);

  // Update animation configuration when it changes
  useEffect(() => {
    opacityAnimationRef.current.duration = animationDuration;
    opacityAnimationRef.current.delay = animationDelay;
    opacityAnimationRef.current.easingFunction = animationEasing;
  }, [animationDuration, animationDelay, animationEasing]);

  // Handle the height transition when lockFootprint changes
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    // Handle outline entity opacity
    if (outlineEntityRef.current && outlineEntityRef.current.polyline) {
      if (lockFootprint) {
        // When entering locked mode - animate opacity to 0
        startAnimation(opacityAnimationRef.current, 1.0, 0.0);
      } else {
        lastImageIdRef.current = null;
        // When leaving locked mode - set opacity to 1 instantly
        if (
          outlineEntityRef.current.polyline.material instanceof
          ColorMaterialProperty
        ) {
          // Set opacity to 1 immediately
          (
            outlineEntityRef.current.polyline.material as ColorMaterialProperty
          ).color = new ConstantProperty(Color.WHITE);
        }

        // Ensure visibility is set
        outlineEntityRef.current.show = true;

        // Reset animation flags to prevent transition
        opacityAnimationRef.current.isAnimating = false;
        opacityAnimationRef.current.startTime = null;
        opacityAnimationRef.current.targetValue = 1.0;
      }
    }
    cesiumSafeRequestRender(viewer);
  }, [lockFootprint, viewerRef, animationDuration, animationEasing]);

  const createOutlineEntity = (positions: Cartesian3[]) => {
    if (!positions || positions.length === 0) return null;

    // Close the loop by adding the first position to the end
    const outlinePositions = [...positions, positions[0]];

    return new Entity({
      id: FOOTPRINT_OUTLINE_ID,
      name: `${OBLIQUE_DATASOURCE_PREFIX}-outline-${
        nearestImage?.record.id || ""
      }`,
      show: true, // Always show initially, opacity will control visibility
      polyline: new PolylineGraphics({
        positions: outlinePositions,
        width: new ConstantProperty(OUTLINE_WIDTH),
        material: new ColorMaterialProperty(createOpacityCallbackProperty()),
        clampToGround: new ConstantProperty(true),
      }),
    });
  };

  useEffect(() => {
    const viewer = viewerRef.current;

    if (!viewer || !nearestImage || !footprintData) {
      return;
    }

    if (!isObliqueMode) {
      cleanupEntities(viewer);
      lastImageIdRef.current = null;
      return;
    }

    if (nearestImage.record.id === lastImageIdRef.current) {
      return;
    }

    lastImageIdRef.current = nearestImage.record.id;

    cleanupEntities(viewer);

    const matchingFeature = findMatchingFeature(
      footprintData.features as FootprintFeature[],
      nearestImage.record.id
    );

    if (!matchingFeature) return;

    // Extract polygon coordinates from the feature
    const polygonCoords = matchingFeature.geometry.coordinates.map((ring) =>
      ring.map((coord) => [coord[0], coord[1]])
    );

    // Get polygon hierarchy for use in both entities
    const polygonHierarchy = polygonHierarchyFromPolygonCoords(polygonCoords);

    // Store the polygon positions for later use with the outline
    if (polygonHierarchy.positions && polygonHierarchy.positions.length > 0) {
      polygonPositionsRef.current = [...polygonHierarchy.positions];
    }

    if (outlineEntityRef.current) {
      outlineEntityRef.current.show = true;
    } else {
      const outlineEntity = createOutlineEntity(polygonPositionsRef.current);
      if (outlineEntity) {
        viewer.entities.add(outlineEntity);
        outlineEntityRef.current = outlineEntity;
      }
    }
    cesiumSafeRequestRender(viewer);
  }, [viewerRef, isObliqueMode, nearestImage, footprintData, isDebug]);
};

export default useFootprints;
