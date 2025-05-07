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
  Cartesian3,
} from "cesium";

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
const ANIMATION_DURATION = 3000; // milliseconds
const OUTLINE_WIDTH = 2; // Width for the outline in pixels

export const useFootprints = (): void => {
  const isObliqueMode = useSelector(getObliqueMode);
  const { viewerRef } = useCesiumContext();
  const { nearestImage, footprintData, lockFootprint } =
    useObliqueDataContext();

  const lastImageIdRef = useRef<string | null>(null);
  const footprintEntityRef = useRef<Entity | null>(null);
  const outlineEntityRef = useRef<Entity | null>(null);
  const animationStartTimeRef = useRef<number | null>(null);
  const startHeightRef = useRef<number>(DEFAULT_EXTRUDED_HEIGHT);
  const targetHeightRef = useRef<number>(DEFAULT_EXTRUDED_HEIGHT);
  const isAnimatingRef = useRef<boolean>(false);
  const polygonPositionsRef = useRef<Cartesian3[]>([]);

  // Clean up entities when component unmounts or oblique mode disabled
  useEffect(() => {
    const viewer = viewerRef.current;

    return () => {
      if (viewer && !isObliqueMode) {
        // Clean up the entities when the component unmounts
        viewer.entities.removeById(FOOTPRINT_ENTITY_ID);
        viewer.entities.removeById(FOOTPRINT_OUTLINE_ID);
        viewer.scene.requestRender();
      }
    };
  }, [viewerRef, isObliqueMode]);

  // Handle the height transition when lockFootprint changes
  useEffect(() => {
    const viewer = viewerRef.current;
    if (
      !viewer ||
      !footprintEntityRef.current ||
      !footprintEntityRef.current.polygon
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
    if (footprintEntityRef.current && footprintEntityRef.current.polygon) {
      footprintEntityRef.current.polygon.extrudedHeight =
        heightCallbackProperty;
      viewer.scene.requestRender();
    }

    // Toggle outline visibility based on lockFootprint
    if (outlineEntityRef.current && outlineEntityRef.current.polyline) {
      // Use the show property to toggle visibility
      outlineEntityRef.current.show = !lockFootprint;
      viewer.scene.requestRender();
    }
  }, [lockFootprint, viewerRef]);

  // Helper function to create outline entity
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
      return;
    }

    // Skip unnecessary updates
    if (nearestImage.record.id === lastImageIdRef.current) {
      return;
    }

    lastImageIdRef.current = nearestImage.record.id;

    // Remove previous entities if they exist
    viewer.entities.removeById(FOOTPRINT_ENTITY_ID);
    viewer.entities.removeById(FOOTPRINT_OUTLINE_ID);
    footprintEntityRef.current = null;
    outlineEntityRef.current = null;
    viewer.scene.requestRender();

    const matchingFeature = findMatchingFeature(
      footprintData.features as FootprintFeature[],
      nearestImage.record.id
    );

    if (!matchingFeature) return;

    // Extract polygon coordinates from the feature
    const polygonCoords = matchingFeature.geometry.coordinates.map((ring) =>
      ring.map((coord) => [coord[0], coord[1]])
    );

    // Set initial heights
    const initialHeight = lockFootprint
      ? MIN_EXTRUDED_HEIGHT
      : DEFAULT_EXTRUDED_HEIGHT;
    startHeightRef.current = initialHeight;
    targetHeightRef.current = initialHeight;

    // Create a callback property for the height animation
    const heightCallbackProperty = new CallbackProperty(() => {
      if (!isAnimatingRef.current || animationStartTimeRef.current === null) {
        return targetHeightRef.current;
      }

      const elapsed = performance.now() - animationStartTimeRef.current;
      const progress = Math.min(elapsed / ANIMATION_DURATION, 1);

      // Apply easing function for smoother animation
      const easedProgress = EasingFunction.SINUSOIDAL_IN_OUT(progress);

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

    // Get polygon hierarchy for use in both entities
    const polygonHierarchy = polygonHierarchyFromPolygonCoords(polygonCoords);

    // Store the polygon positions for later use with the outline
    if (polygonHierarchy.positions && polygonHierarchy.positions.length > 0) {
      polygonPositionsRef.current = [...polygonHierarchy.positions];
    }

    // Create the main polygon entity
    const footprintEntity = new Entity({
      id: FOOTPRINT_ENTITY_ID,
      name: `${OBLIQUE_DATASOURCE_PREFIX}-${nearestImage.record.id}`,
      polygon: {
        hierarchy: polygonHierarchy,
        material: new ColorMaterialProperty(Color.WHITE.withAlpha(0.8)),
        outline: new ConstantProperty(false), // Disable outline on the main polygon to avoid duplicate lines
        closeTop: new ConstantProperty(false),
        closeBottom: new ConstantProperty(false),
        extrudedHeight: heightCallbackProperty,
        extrudedHeightReference: HeightReference.RELATIVE_TO_3D_TILE,
        height: new ConstantProperty(HEIGHT_OFFSET),
        heightReference: HeightReference.CLAMP_TO_3D_TILE,
      },
    });

    // Add the main polygon entity to the viewer
    viewer.entities.add(footprintEntity);
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
