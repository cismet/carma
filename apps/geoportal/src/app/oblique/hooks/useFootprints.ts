import { useEffect, useRef } from "react";
import {
  Color,
  ColorMaterialProperty,
  ConstantProperty,
  Entity,
  HeightReference,
  CallbackProperty,
  EasingFunction,
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
const DEFAULT_EXTRUDED_HEIGHT = 80;
const MIN_EXTRUDED_HEIGHT = 0.1;
const ANIMATION_DURATION = 400; // milliseconds

export const useFootprints = (): void => {
  const isObliqueMode = useSelector(getObliqueMode);
  const { viewerRef } = useCesiumContext();
  const { nearestImage, footprintData, lockFootprint } =
    useObliqueDataContext();

  const lastImageIdRef = useRef<string | null>(null);
  const footprintEntityRef = useRef<Entity | null>(null);
  const animationStartTimeRef = useRef<number | null>(null);
  const startHeightRef = useRef<number>(DEFAULT_EXTRUDED_HEIGHT);
  const targetHeightRef = useRef<number>(DEFAULT_EXTRUDED_HEIGHT);
  const isAnimatingRef = useRef<boolean>(false);

  // Clean up entities when component unmounts or oblique mode disabled
  useEffect(() => {
    const viewer = viewerRef.current;

    return () => {
      if (viewer && !isObliqueMode) {
        // Clean up the entity when the component unmounts
        viewer.entities.removeById(FOOTPRINT_ENTITY_ID);
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
  }, [lockFootprint, viewerRef]);

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

    // Remove previous entity if exists
    viewer.entities.removeById(FOOTPRINT_ENTITY_ID);
    footprintEntityRef.current = null;
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

    // Create a callback property that will be evaluated on each frame
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

    // Create the entity directly
    const footprintEntity = new Entity({
      id: FOOTPRINT_ENTITY_ID,
      name: `${OBLIQUE_DATASOURCE_PREFIX}-${nearestImage.record.id}`,
      polygon: {
        hierarchy: polygonHierarchyFromPolygonCoords(polygonCoords),
        material: new ColorMaterialProperty(Color.WHITE.withAlpha(0.8)),
        outline: new ConstantProperty(false),
        //outlineColor: new ConstantProperty(Color.WHITE),
        //outlineWidth: new ConstantProperty(2),
        closeTop: new ConstantProperty(false),
        closeBottom: new ConstantProperty(false),
        extrudedHeight: heightCallbackProperty,
        extrudedHeightReference: HeightReference.RELATIVE_TO_GROUND,
        height: new ConstantProperty(0),
        heightReference: HeightReference.RELATIVE_TO_GROUND,
      },
    });

    viewer.entities.add(footprintEntity);
    footprintEntityRef.current = footprintEntity;
    viewer.scene.requestRender();
  }, [viewerRef, isObliqueMode, nearestImage, footprintData, lockFootprint]);
};
