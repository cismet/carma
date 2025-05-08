import { MutableRefObject, useEffect, useRef } from "react";
import { useSelector } from "react-redux";

import {
  Color,
  ColorMaterialProperty,
  ConstantProperty,
  Entity,
  HeightReference,
  CallbackProperty,
  EasingFunction,
  PolylineGraphics,
  Math as CesiumMath,
  type Cartesian3,
  type Property,
  type PolygonGraphics,
  Viewer,
} from "cesium";

import { useFeatureFlags } from "@carma-apps/portals";
import {
  useCesiumContext,
  polygonHierarchyFromPolygonCoords,
  cesiumSafeRequestRender,
} from "@carma-mapping/cesium-engine";

import { useObliqueDataContext } from "./useObliqueDataContext";

import { getObliqueMode } from "../../store/slices/ui";
import type { FootprintFeature } from "../utils/footprintUtils";
import { findMatchingFeature } from "../utils/footprintUtils";

const OBLIQUE_DATASOURCE_PREFIX = "oblq-footprint";
const FOOTPRINT_ENTITY_ID = "oblq-footprint-entity";
const FOOTPRINT_OUTLINE_ID = "oblq-footprint-outline";
const DEFAULT_EXTRUDED_HEIGHT = 50;
const HEIGHT_OFFSET = -10; // Offset for the height of the polygon
const MIN_EXTRUDED_HEIGHT = HEIGHT_OFFSET + 0.1; // Minimum height for the polygon
const DEFAULT_ANIMATION_DURATION = 500; // milliseconds
const OUTLINE_WIDTH = 2; // Width for the outline in pixels

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

const cleanupFootprintEntity = (
  viewer: Viewer,
  ref: MutableRefObject<Entity | null>
) => {
  if (ref.current) {
    viewer.entities.removeById(FOOTPRINT_ENTITY_ID);
    ref.current = null;
  }
};

const cleanupOutlineEntity = (
  viewer: Viewer,
  ref: MutableRefObject<Entity | null>
) => {
  if (ref.current) {
    viewer.entities.removeById(FOOTPRINT_OUTLINE_ID);
    ref.current = null;
  }
};

type HeightAnimationState = AnimationState<number>;
type OpacityAnimationState = AnimationState<number>;

export const useFootprints = (): void => {
  const isObliqueMode = useSelector(getObliqueMode);
  const { viewerRef } = useCesiumContext();
  const { nearestImage, footprintData, lockFootprint, animations } =
    useObliqueDataContext();

  const featureFlags = useFeatureFlags();
  const { featureFlagObliqueFootprintStyleNoWall } = featureFlags;

  const showWall = !featureFlagObliqueFootprintStyleNoWall;

  const animationDuration =
    animations?.footprintExtrusion?.duration ?? DEFAULT_ANIMATION_DURATION;
  const animationDelay = animations?.outlineFadeOut?.duration ?? 0;
  const animationEasing =
    animations?.footprintExtrusion?.easingFunction ||
    EasingFunction.LINEAR_NONE;

  // Common refs
  const lastImageIdRef = useRef<string | null>(null);
  const footprintEntityRef = useRef<Entity | null>(null);
  const outlineEntityRef = useRef<Entity | null>(null);
  const polygonPositionsRef = useRef<Cartesian3[]>([]);
  const prevObliqueMode = useRef<boolean>(isObliqueMode);

  // Animation state refs
  const heightAnimationRef = useRef<HeightAnimationState>(
    createAnimationState({
      startValue: DEFAULT_EXTRUDED_HEIGHT,
      targetValue: DEFAULT_EXTRUDED_HEIGHT,
      duration: animationDuration,
      easingFunction: animationEasing,
    })
  );

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
    if (!viewer || viewer.isDestroyed()) return;
    cleanupFootprintEntity(viewer, footprintEntityRef);
    cleanupOutlineEntity(viewer, outlineEntityRef);
    viewer.scene.requestRender();
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
    // Update the animation duration and easing function
    heightAnimationRef.current.duration = animationDuration;
    heightAnimationRef.current.easingFunction = animationEasing;

    opacityAnimationRef.current.duration = animationDuration;
    opacityAnimationRef.current.delay = animationDelay;
    opacityAnimationRef.current.easingFunction = animationEasing;
  }, [animationDuration, animationDelay, animationEasing]);

  // Handle the height transition when lockFootprint changes
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    // Handle footprint entity height animation if it exists
    if (footprintEntityRef.current && footprintEntityRef.current.polygon) {
      const startValue =
        footprintEntityRef.current.polygon.extrudedHeight instanceof
        ConstantProperty
          ? (
              footprintEntityRef.current.polygon.extrudedHeight as any
            ).getValue()
          : lockFootprint
          ? DEFAULT_EXTRUDED_HEIGHT
          : MIN_EXTRUDED_HEIGHT;

      const targetValue = lockFootprint
        ? MIN_EXTRUDED_HEIGHT
        : DEFAULT_EXTRUDED_HEIGHT;

      startAnimation(heightAnimationRef.current, startValue, targetValue);

      // Create a CallbackProperty that will be evaluated on each frame
      const heightCallbackProperty = new CallbackProperty(() => {
        return processAnimation(heightAnimationRef.current, viewer);
      }, false);

      footprintEntityRef.current.polygon.extrudedHeight =
        heightCallbackProperty;
      cesiumSafeRequestRender(viewer);
    }

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

    const heightCallbackProperty = new CallbackProperty(() => {
      return processAnimation(heightAnimationRef.current, viewer);
    }, false);

    // Get polygon hierarchy for use in both entities
    const polygonHierarchy = polygonHierarchyFromPolygonCoords(polygonCoords);

    // Store the polygon positions for later use with the outline
    if (polygonHierarchy.positions && polygonHierarchy.positions.length > 0) {
      polygonPositionsRef.current = [...polygonHierarchy.positions];
    }

    if (showWall) {
      // TODO: fix types here
      const footprintEntity = new Entity({
        id: FOOTPRINT_ENTITY_ID,
        name: `${OBLIQUE_DATASOURCE_PREFIX}-${nearestImage.record.id}`,
        polygon: {
          hierarchy: polygonHierarchy as unknown as Property,
          material: new ColorMaterialProperty(Color.WHITE.withAlpha(0.8)),
          outline: new ConstantProperty(false), // Disable outline on the main polygon to avoid duplicate lines
          closeTop: new ConstantProperty(false),
          closeBottom: new ConstantProperty(false),
          extrudedHeight: heightCallbackProperty,
          extrudedHeightReference: new ConstantProperty(
            HeightReference.RELATIVE_TO_3D_TILE
          ),
          height: new ConstantProperty(HEIGHT_OFFSET),
          heightReference: new ConstantProperty(
            HeightReference.CLAMP_TO_3D_TILE
          ),
        } as unknown as PolygonGraphics,
      });
      viewer.entities.add(footprintEntity);
      footprintEntityRef.current = footprintEntity;
    }
    // Always create the outline entity, but control visibility with the show property
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
  }, [viewerRef, isObliqueMode, nearestImage, footprintData, showWall]);
};

export default useFootprints;
