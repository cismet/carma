import { useEffect, useRef } from "react";
import {
  Color,
  ColorMaterialProperty,
  ConstantProperty,
  Entity,
  HeightReference,
  CallbackProperty,
  EasingFunction,
  PolylineGraphics,
} from "cesium";
import type { Cartesian3, Property, PolygonGraphics } from "cesium";

import {
  useCesiumContext,
  polygonHierarchyFromPolygonCoords,
} from "@carma-mapping/cesium-engine";
import { useObliqueDataContext } from "./useObliqueDataContext";
import { useSelector } from "react-redux";

import { getObliqueMode } from "../../store/slices/ui";
import type { FootprintFeature } from "../utils/footprintUtils";
import { findMatchingFeature } from "../utils/footprintUtils";
import { AnimationConfig } from "../types";
import { useFeatureFlags } from "@carma-apps/portals";

const OBLIQUE_DATASOURCE_PREFIX = "oblq-footprint";
const FOOTPRINT_ENTITY_ID = "oblq-footprint-entity";
const FOOTPRINT_OUTLINE_ID = "oblq-footprint-outline";
const DEFAULT_EXTRUDED_HEIGHT = 50;
const HEIGHT_OFFSET = -10; // Offset for the height of the polygon
const MIN_EXTRUDED_HEIGHT = HEIGHT_OFFSET + 0.1; // Minimum height for the polygon
const DEFAULT_ANIMATION_DURATION = 500; // milliseconds
const EXIT_ANIMATION_DURATION = 300; // faster animation when exiting
const OUTLINE_WIDTH = 2; // Width for the outline in pixels

export const useFootprints = (): void => {
  const isObliqueMode = useSelector(getObliqueMode);
  const { viewerRef } = useCesiumContext();
  const { nearestImage, footprintData, lockFootprint, animations } =
    useObliqueDataContext();

  const featureFlags = useFeatureFlags();
  const { featureFlagObliqueFootprintStyleNoWall } = featureFlags;

  const showWall = !featureFlagObliqueFootprintStyleNoWall;

  const animationDuration =
    animations?.footprintExtrusion?.duration || DEFAULT_ANIMATION_DURATION;
  const animationEasing =
    animations?.footprintExtrusion?.easingFunction ||
    EasingFunction.LINEAR_NONE;

  const lastImageIdRef = useRef<string | null>(null);
  const footprintEntityRef = useRef<Entity | null>(null);
  const outlineEntityRef = useRef<Entity | null>(null);
  const animationStartTimeRef = useRef<number | null>(null);
  const startHeightRef = useRef<number>(DEFAULT_EXTRUDED_HEIGHT);
  const targetHeightRef = useRef<number>(DEFAULT_EXTRUDED_HEIGHT);
  const isAnimatingRef = useRef<boolean>(false);
  const polygonPositionsRef = useRef<Cartesian3[]>([]);
  const prevObliqueMode = useRef<boolean>(isObliqueMode);
  const isExitAnimationRef = useRef<boolean>(false);
  const exitAnimationCompleteCallbackRef = useRef<(() => void) | null>(null);

  const cleanupFootprintEntity = () => {
    const viewer = viewerRef.current;
    if (viewer && !viewer.isDestroyed() && footprintEntityRef.current) {
      viewer.entities.removeById(FOOTPRINT_ENTITY_ID);
      footprintEntityRef.current = null;
      viewer.scene.requestRender();
    }
  };

  const cleanupOutlineEntity = () => {
    const viewer = viewerRef.current;
    if (viewer && !viewer.isDestroyed() && outlineEntityRef.current) {
      viewer.entities.removeById(FOOTPRINT_OUTLINE_ID);
      outlineEntityRef.current = null;
      viewer.scene.requestRender();
    }
  };

  const cleanupEntities = () => {
    cleanupFootprintEntity();
    cleanupOutlineEntity();
  };

  const startExitAnimation = (onComplete: () => void) => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) {
      onComplete();
      return;
    }

    // Always clean up the outline entity immediately, regardless of whether we have a footprint
    cleanupOutlineEntity();

    const hasAnimatableFootprint =
      footprintEntityRef.current && footprintEntityRef.current.polygon;

    // If we don't have a footprint to animate, complete immediately
    if (!hasAnimatableFootprint) {
      onComplete();
      return;
    }

    let currentHeight = DEFAULT_EXTRUDED_HEIGHT;
    if (
      footprintEntityRef.current.polygon.extrudedHeight instanceof
      ConstantProperty
    ) {
      currentHeight = (
        footprintEntityRef.current.polygon.extrudedHeight as any
      ).getValue();
    }

    // If already at minimum height, just complete
    if (Math.abs(currentHeight - MIN_EXTRUDED_HEIGHT) < 0.1) {
      onComplete();
      return;
    }

    // Set animation parameters for exit animation
    startHeightRef.current = currentHeight;
    targetHeightRef.current = MIN_EXTRUDED_HEIGHT;
    animationStartTimeRef.current = performance.now();
    isAnimatingRef.current = true;
    isExitAnimationRef.current = true;
    exitAnimationCompleteCallbackRef.current = onComplete;

    // Create a CallbackProperty that will be evaluated on each frame
    const heightCallbackProperty = new CallbackProperty(() => {
      if (!isAnimatingRef.current || animationStartTimeRef.current === null) {
        return targetHeightRef.current;
      }

      const elapsed = performance.now() - animationStartTimeRef.current;
      const progress = Math.min(elapsed / EXIT_ANIMATION_DURATION, 1);

      const easedProgress = EasingFunction.SINUSOIDAL_IN(progress);

      // Calculate new height with eased interpolation
      const newHeight =
        startHeightRef.current +
        (targetHeightRef.current - startHeightRef.current) * easedProgress;

      // When animation is complete, mark it as done and trigger callback
      if (progress >= 1) {
        isAnimatingRef.current = false;
        isExitAnimationRef.current = false;

        if (exitAnimationCompleteCallbackRef.current) {
          const callback = exitAnimationCompleteCallbackRef.current;
          exitAnimationCompleteCallbackRef.current = null;
          callback();
        }
      }

      if (viewer && !viewer.isDestroyed()) {
        viewer.scene.requestRender();
      }

      return newHeight;
    }, false);

    // Update the entity with the callback property
    if (
      footprintEntityRef.current &&
      footprintEntityRef.current.polygon &&
      viewer &&
      !viewer.isDestroyed()
    ) {
      footprintEntityRef.current.polygon.extrudedHeight =
        heightCallbackProperty;
      viewer.scene.requestRender();
    }
  };

  // Clean up entities when component unmounts
  useEffect(() => {
    return () => {
      cleanupEntities();
    };
  }, []);

  // React to changes in oblique mode
  useEffect(() => {
    // If we're leaving oblique mode, trigger exit animation then clean up the footprint
    if (prevObliqueMode.current && !isObliqueMode) {
      // Always clean up the outline immediately
      cleanupOutlineEntity();
      // Start exit animation for the footprint, then clean up when complete
      startExitAnimation(cleanupFootprintEntity);
    }
    prevObliqueMode.current = isObliqueMode;
  }, [isObliqueMode, viewerRef]);

  // Handle the height transition when lockFootprint changes
  useEffect(() => {
    const viewer = viewerRef.current;
    if (
      !viewer ||
      !footprintEntityRef.current ||
      !footprintEntityRef.current.polygon ||
      isExitAnimationRef.current // Skip normal animation if exit animation is running
    )
      return;

    // Set animation parameters
    startHeightRef.current =
      footprintEntityRef.current.polygon.extrudedHeight instanceof
      ConstantProperty
        ? (footprintEntityRef.current.polygon.extrudedHeight as any).getValue()
        : lockFootprint
        ? DEFAULT_EXTRUDED_HEIGHT
        : MIN_EXTRUDED_HEIGHT;

    targetHeightRef.current = lockFootprint
      ? MIN_EXTRUDED_HEIGHT
      : DEFAULT_EXTRUDED_HEIGHT;

    // Skip animation if the height is already at the target
    if (Math.abs(startHeightRef.current - targetHeightRef.current) < 0.1)
      return;

    animationStartTimeRef.current = performance.now();
    isAnimatingRef.current = true;

    // Create a CallbackProperty that will be evaluated on each frame
    const heightCallbackProperty = new CallbackProperty(() => {
      if (!isAnimatingRef.current || animationStartTimeRef.current === null) {
        return targetHeightRef.current;
      }

      const elapsed = performance.now() - animationStartTimeRef.current;
      const progress = Math.min(elapsed / animationDuration, 1);

      // Apply easing function for smoother animation
      const easedProgress = animationEasing(progress);

      // Calculate new height with eased interpolation
      const newHeight =
        startHeightRef.current +
        (targetHeightRef.current - startHeightRef.current) * easedProgress;

      // When animation is complete, mark it as done
      if (progress >= 1) {
        isAnimatingRef.current = false;
      }

      if (viewer && !viewer.isDestroyed()) {
        viewer.scene.requestRender();
      }

      return newHeight;
    }, false);

    // Update the entity with the callback property
    if (
      footprintEntityRef.current &&
      footprintEntityRef.current.polygon &&
      viewer &&
      !viewer.isDestroyed()
    ) {
      footprintEntityRef.current.polygon.extrudedHeight =
        heightCallbackProperty;
      viewer.scene.requestRender();
    }

    // Toggle outline visibility based on lockFootprint
    if (
      outlineEntityRef.current &&
      outlineEntityRef.current.polyline &&
      viewer &&
      !viewer.isDestroyed()
    ) {
      // Use the show property to toggle visibility
      outlineEntityRef.current.show = !lockFootprint;
      viewer.scene.requestRender();
    }
  }, [lockFootprint, viewerRef]);

  const createOutlineEntity = (positions: Cartesian3[]) => {
    if (!positions || positions.length === 0) return null;

    // Close the loop by adding the first position to the end
    const outlinePositions = [...positions, positions[0]];

    return new Entity({
      id: FOOTPRINT_OUTLINE_ID,
      name: `${OBLIQUE_DATASOURCE_PREFIX}-outline-${
        nearestImage?.record.id || ""
      }`,
      show: !lockFootprint, // Initially visible only when lockFootprint is false
      polyline: new PolylineGraphics({
        positions: outlinePositions,
        width: new ConstantProperty(OUTLINE_WIDTH),
        material: new ColorMaterialProperty(Color.WHITE),
        clampToGround: new ConstantProperty(true),
      }),
    });
  };

  useEffect(() => {
    const viewer = viewerRef.current;

    if (!isObliqueMode || !viewer || !nearestImage || !footprintData) {
      // Clean up if we're not in oblique mode and not already in exit animation
      if (!isObliqueMode && !isExitAnimationRef.current) {
        cleanupEntities();
      }
      return;
    }

    // Skip unnecessary updates
    if (nearestImage.record.id === lastImageIdRef.current) {
      return;
    }

    lastImageIdRef.current = nearestImage.record.id;

    cleanupEntities();

    const matchingFeature = findMatchingFeature(
      footprintData.features as FootprintFeature[],
      nearestImage.record.id
    );

    if (!matchingFeature) return;

    // Extract polygon coordinates from the feature
    const polygonCoords = matchingFeature.geometry.coordinates.map((ring) =>
      ring.map((coord) => [coord[0], coord[1]])
    );

    const initialHeight = lockFootprint
      ? MIN_EXTRUDED_HEIGHT
      : DEFAULT_EXTRUDED_HEIGHT;
    startHeightRef.current = initialHeight;
    targetHeightRef.current = initialHeight;

    const heightCallbackProperty = new CallbackProperty(() => {
      if (!isAnimatingRef.current || animationStartTimeRef.current === null) {
        return targetHeightRef.current;
      }

      const elapsed = performance.now() - animationStartTimeRef.current;
      const duration = isExitAnimationRef.current
        ? EXIT_ANIMATION_DURATION
        : DEFAULT_ANIMATION_DURATION;
      const progress = Math.min(elapsed / duration, 1);

      const easedProgress = isExitAnimationRef.current
        ? EasingFunction.SINUSOIDAL_IN(progress)
        : EasingFunction.SINUSOIDAL_IN_OUT(progress);

      // Calculate new height with eased interpolation
      const newHeight =
        startHeightRef.current +
        (targetHeightRef.current - startHeightRef.current) * easedProgress;

      // When animation is complete, mark it as done
      if (progress >= 1) {
        isAnimatingRef.current = false;

        // Call the exit animation completion callback if applicable
        if (
          isExitAnimationRef.current &&
          exitAnimationCompleteCallbackRef.current
        ) {
          isExitAnimationRef.current = false;
          const callback = exitAnimationCompleteCallbackRef.current;
          exitAnimationCompleteCallbackRef.current = null;
          callback();
        }
      }

      // Force Cesium to re-render
      if (viewer && !viewer.isDestroyed()) {
        viewer.scene.requestRender();
      }

      return newHeight;
    }, false);

    // Get polygon hierarchy for use in both entities
    const polygonHierarchy = polygonHierarchyFromPolygonCoords(polygonCoords);

    // Store the polygon positions for later use with the outline
    if (polygonHierarchy.positions && polygonHierarchy.positions.length > 0) {
      polygonPositionsRef.current = [...polygonHierarchy.positions];
    }

    // Create the main polygon entity
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
        heightReference: new ConstantProperty(HeightReference.CLAMP_TO_3D_TILE),
      } as unknown as PolygonGraphics,
    });

    // Add the main polygon entity to the viewer
    showWall && viewer.entities.add(footprintEntity);
    footprintEntityRef.current = footprintEntity;

    // Always create the outline entity, but control visibility with the show property
    const outlineEntity = createOutlineEntity(polygonPositionsRef.current);
    if (outlineEntity) {
      viewer.entities.add(outlineEntity);
      outlineEntityRef.current = outlineEntity;
    }

    viewer.scene.requestRender();
  }, [viewerRef, isObliqueMode, nearestImage, footprintData, lockFootprint]);
};

export default useFootprints;
