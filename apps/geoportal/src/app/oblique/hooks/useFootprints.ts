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
  sampleTerrainMostDetailed,
  Cartographic,
  PolygonHierarchy,
} from "cesium";
import { Cartesian3, Property, PolygonGraphics } from "cesium";

import {
  useCesiumContext,
  polygonHierarchyFromPolygonCoords,
} from "@carma-mapping/cesium-engine";
import { useObliqueDataContext } from "./useObliqueDataContext";
import { useSelector } from "react-redux";

import { getObliqueMode } from "../../store/slices/ui";
import type { FootprintFeature } from "../utils/footprintUtils";
import { findMatchingFeature } from "../utils/footprintUtils";

const OBLIQUE_DATASOURCE_PREFIX = "oblq-footprint";
const FOOTPRINT_ENTITY_ID = "oblq-footprint-entity";
const FOOTPRINT_OUTLINE_ID = "oblq-footprint-outline";
const DEFAULT_EXTRUDED_HEIGHT = 50;
const HEIGHT_OFFSET = -10; // Offset for the height of the polygon
const MIN_EXTRUDED_HEIGHT = HEIGHT_OFFSET + 0.1; // Minimum height for the polygon
const ANIMATION_DURATION = 800; // milliseconds
const EXIT_ANIMATION_DURATION = 300; // faster animation when exiting
const OUTLINE_WIDTH = 2; // Width for the outline in pixels

export const useFootprints = (): void => {
  const isObliqueMode = useSelector(getObliqueMode);
  const { viewerRef, terrainProviderRef } = useCesiumContext();
  const { nearestImage, footprintData, lockFootprint } =
    useObliqueDataContext();

  const lastImageIdRef = useRef<string | null>(null);
  const footprintEntityRef = useRef<Entity | null>(null);
  const outlineEntityRef = useRef<Entity | null>(null);
  const animationStartTimeRef = useRef<number | null>(null);
  const startHeightRef = useRef<number>(DEFAULT_EXTRUDED_HEIGHT);
  const targetHeightRef = useRef<number>(DEFAULT_EXTRUDED_HEIGHT);
  const isAnimatingRef = useRef<boolean>(false);
  const polygonRingRef = useRef<Cartographic[] | null>(null);
  const maxTerrainHeightRef = useRef<number | null>(null);
  const minTerrainHeightRef = useRef<number | null>(null);
  const prevObliqueMode = useRef<boolean>(isObliqueMode);
  const isExitAnimationRef = useRef<boolean>(false);
  const exitAnimationCompleteCallbackRef = useRef<(() => void) | null>(null);

  // Function to clean up entities
  const cleanupEntities = () => {
    const viewer = viewerRef.current;
    if (viewer && !viewer.isDestroyed()) {
      viewer.entities.removeById(FOOTPRINT_ENTITY_ID);
      viewer.entities.removeById(FOOTPRINT_OUTLINE_ID);
      footprintEntityRef.current = null;
      outlineEntityRef.current = null;
      viewer.scene.requestRender();
    }
  };

  // Start exit animation and clean up after completion
  const startExitAnimation = (onComplete: () => void) => {
    const viewer = viewerRef.current;
    if (
      !viewer ||
      viewer.isDestroyed() ||
      !footprintEntityRef.current ||
      !footprintEntityRef.current.polygon
    ) {
      // If no entities to animate, just complete immediately
      onComplete();
      return;
    }

    // Get current height
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

      // Apply easing function for smoother animation
      const easedProgress = EasingFunction.SINUSOIDAL_IN(progress);

      // Calculate new height with eased interpolation
      const newHeight =
        startHeightRef.current +
        (targetHeightRef.current - startHeightRef.current) * easedProgress;

      // When animation is complete, mark it as done and trigger callback
      if (progress >= 1) {
        isAnimatingRef.current = false;
        isExitAnimationRef.current = false;

        // Call the completion callback after animation finishes
        if (exitAnimationCompleteCallbackRef.current) {
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
    // If we're leaving oblique mode, trigger exit animation then clean up
    if (prevObliqueMode.current && !isObliqueMode) {
      // Start exit animation, then clean up when complete
      startExitAnimation(cleanupEntities);
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
      const progress = Math.min(elapsed / ANIMATION_DURATION, 1);

      // Apply easing function for smoother animation
      const easedProgress = EasingFunction.SINUSOIDAL_OUT(progress);

      // Calculate new height with eased interpolation
      const newHeight =
        startHeightRef.current +
        (targetHeightRef.current - startHeightRef.current) * easedProgress;

      // When animation is complete, mark it as done
      if (progress >= 1) {
        isAnimatingRef.current = false;
      }

      // Force Cesium to re-render
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

  // Helper function to create or update outline entity
  const createOrUpdateOutlineEntity = (ring: Cartographic[]) => {
    if (!ring || ring.length === 0) return null;
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return null;

    const positions = ring.map((coord) => Cartographic.toCartesian(coord));

    // Check if outline entity already exists
    if (outlineEntityRef.current) {
      // Update existing entity
      if (outlineEntityRef.current.polyline) {
        outlineEntityRef.current.polyline.positions = positions;
        outlineEntityRef.current.show = !lockFootprint;
      }
      return outlineEntityRef.current;
    } else {
      // Create new entity if it doesn't exist
      const polyline: PolylineGraphics.ConstructorOptions = {
        positions,
        width: OUTLINE_WIDTH,
        material: Color.WHITE,
      };

      const outlineEntity = new Entity({
        id: FOOTPRINT_OUTLINE_ID,
        name: `${OBLIQUE_DATASOURCE_PREFIX}-outline-${
          nearestImage?.record.id || ""
        }`,
        show: !lockFootprint,
        polyline,
      });

      viewer.entities.add(outlineEntity);
      outlineEntityRef.current = outlineEntity;
      return outlineEntity;
    }
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

    // Remove previous entities when switching to a new image
    if (viewer && !viewer.isDestroyed()) {
      viewer.entities.removeById(FOOTPRINT_ENTITY_ID);
      viewer.entities.removeById(FOOTPRINT_OUTLINE_ID);
      footprintEntityRef.current = null;
      outlineEntityRef.current = null;
      viewer.scene.requestRender();
    }

    const matchingFeature = findMatchingFeature(
      footprintData.features as FootprintFeature[],
      nearestImage.record.id
    );

    if (!matchingFeature) return;

    const quadCorners = matchingFeature.geometry.coordinates[0]
      .slice(0, 4)
      .map((coord) => [coord[0], coord[1]]);

    // We create an async function to handle the terrain sampling
    const setupFootprint = async () => {
      try {
        // add elevation to the polygon coordinates
        const coordsWithHeights = await sampleTerrainMostDetailed(
          terrainProviderRef.current,
          quadCorners.map(([lon, lat]) => Cartographic.fromDegrees(lon, lat))
        );

        const minHeight = coordsWithHeights.reduce(
          (min, coord) => Math.min(min, coord.height),
          1000
        );
        const maxHeight = coordsWithHeights.reduce(
          (max, coord) => Math.max(max, coord.height),
          0
        );
        coordsWithHeights.push(coordsWithHeights[0]); // Close the polygon

        polygonRingRef.current = coordsWithHeights;
        minTerrainHeightRef.current = minHeight;
        maxTerrainHeightRef.current = maxHeight;

        // Check if component is still mounted and in the right state before continuing
        if (
          !viewerRef.current ||
          viewerRef.current.isDestroyed() ||
          !isObliqueMode
        ) {
          return;
        }

        // Set initial heights
        const initialHeight = lockFootprint
          ? MIN_EXTRUDED_HEIGHT
          : DEFAULT_EXTRUDED_HEIGHT;
        startHeightRef.current = initialHeight;
        targetHeightRef.current = initialHeight;

        // Create a callback property for the height animation
        const heightCallbackProperty = new CallbackProperty(() => {
          if (
            !isAnimatingRef.current ||
            animationStartTimeRef.current === null
          ) {
            return targetHeightRef.current;
          }

          const elapsed = performance.now() - animationStartTimeRef.current;
          // Use the appropriate duration based on whether it's an exit animation
          const duration = isExitAnimationRef.current
            ? EXIT_ANIMATION_DURATION
            : ANIMATION_DURATION;
          const progress = Math.min(elapsed / duration, 1);

          // Apply easing function for smoother animation
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

        const cartesianRing = coordsWithHeights.map((coord: Cartographic) =>
          Cartographic.toCartesian(coord)
        );

        const hierarchy = new PolygonHierarchy(cartesianRing);

        // Check if footprint entity already exists
        if (footprintEntityRef.current) {
          // Update existing entity polygon properties
          if (footprintEntityRef.current.polygon) {
            footprintEntityRef.current.polygon.hierarchy = hierarchy;
            footprintEntityRef.current.polygon.extrudedHeight = heightCallbackProperty;
            footprintEntityRef.current.name = `${OBLIQUE_DATASOURCE_PREFIX}-${nearestImage.record.id}`;
          }
        } else {
          // Create new entity if it doesn't exist
          const polygon: PolygonGraphics.ConstructorOptions = {
            hierarchy,
            material: Color.WHITE.withAlpha(0.8),
            outline: false, // Disable outline on the main polygon to avoid duplicate lines
            closeTop: false,
            closeBottom: false,
            extrudedHeight: heightCallbackProperty,
            extrudedHeightReference: HeightReference.RELATIVE_TO_3D_TILE,
            height: HEIGHT_OFFSET,
            heightReference: HeightReference.CLAMP_TO_3D_TILE,
            perPositionHeight: true,
          };

          const footprintEntity = new Entity({
            id: FOOTPRINT_ENTITY_ID,
            name: `${OBLIQUE_DATASOURCE_PREFIX}-${nearestImage.record.id}`,
            polygon,
          });

          // Add the main polygon entity to the viewer
          viewer.entities.add(footprintEntity);
          footprintEntityRef.current = footprintEntity;
        }

        // Create or update the outline entity
        createOrUpdateOutlineEntity(polygonRingRef.current);

        viewer.scene.requestRender();
      } catch (error) {
        console.error("Error setting up footprint:", error);
      }
    };

    // Start the async process
    setupFootprint();

    // Return synchronous cleanup function
    return () => {
      // Since we can't do async operations directly in the cleanup function,
      // we can only perform synchronous cleanup here
      cleanupEntities();
    };
  }, [
    viewerRef,
    isObliqueMode,
    nearestImage,
    footprintData,
    lockFootprint,
    terrainProviderRef,
  ]);
};
