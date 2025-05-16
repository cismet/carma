import { MutableRefObject, useEffect, useRef } from "react";

import {
  Color,
  ColorMaterialProperty,
  ConstantProperty,
  Entity,
  CallbackProperty,
  EasingFunction,
  PolylineGraphics,
  type Cartesian3,
  Viewer,
  defined,
} from "cesium";

import { useMemoMergedDefaultOptions } from "@carma-commons/utils";
import {
  useCesiumContext,
  polygonHierarchyFromPolygonCoords,
  cesiumSafeRequestRender,
  isValidViewerInstance,
} from "@carma-mapping/cesium-engine";

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

const OBLIQUE_DATASOURCE_PREFIX = "oblq-footprint";
const FOOTPRINT_OUTLINE_ID = "oblq-footprint-outline";

const defaultFootprintsStyle: ObliqueFootprintsStyle = {
  outlineColor: Color.WHITE,
  outlineWidth: 5,
  outlineOpacity: 1,
};

const cleanupOutlineEntity = (
  viewerRef: MutableRefObject<Viewer | null>,
  ref: MutableRefObject<Entity | null>,
  debug = false
) => {
  const viewer = viewerRef.current;
  if (isValidViewerInstance(viewer) && defined(viewer.entities)) {
    debug && console.log(`Oblique Footprints: Removing outline entity`);
    viewer.entities.removeById(FOOTPRINT_OUTLINE_ID);
    ref.current = null;
    cesiumSafeRequestRender(viewer);
  }
};

export const useFootprints = (debug = false): void => {
  const { viewerRef } = useCesiumContext();
  const {
    isObliqueMode,
    nearestImage,
    footprintData,
    lockFootprint,
    animations,
    footprintsStyle,
  } = useOblique();

  const { outlineColor, outlineOpacity, outlineWidth } =
    useMemoMergedDefaultOptions(footprintsStyle, defaultFootprintsStyle);

  const animationDuration = animations?.outlineFadeOut?.duration ?? 1000;
  const animationDelay = animations?.outlineFadeOut?.delay ?? 0;
  const animationEasing =
    animations?.outlineFadeOut?.easingFunction || EasingFunction.LINEAR_NONE;

  const lastImageIdRef = useRef<string | null>(null);
  const outlineEntityRef = useRef<Entity | null>(null);
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

  // Clean up entities when component unmounts
  useEffect(() => {
    return () => {
      cleanupOutlineEntity(viewerRef, outlineEntityRef, debug);
    };
  }, [debug, viewerRef]);

  useEffect(() => {
    // If we're leaving oblique mode, trigger exit animation then clean up the footprint
    if (prevObliqueMode.current && !isObliqueMode) {
      // Always clean up the outline immediately
      cleanupOutlineEntity(viewerRef, outlineEntityRef, debug);
    }
    prevObliqueMode.current = isObliqueMode;
  }, [isObliqueMode, viewerRef, debug]);

  useEffect(() => {
    opacityAnimationRef.current.duration = animationDuration;
    opacityAnimationRef.current.delay = animationDelay;
    opacityAnimationRef.current.easingFunction = animationEasing;
  }, [animationDuration, animationDelay, animationEasing]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    // When lockFootprint is set, start fade-out animation with a completion callback to clean up
    if (outlineEntityRef.current && outlineEntityRef.current.polyline) {
      if (lockFootprint) {
        startAnimation(opacityAnimationRef.current, outlineOpacity, 0.0, {
          forceStart: true,
          onComplete: () => {
            // Remove entity completely when animation finishes
            cleanupOutlineEntity(viewerRef, outlineEntityRef, debug);
            // Reset lastImageIdRef to null to force recreation on unlock
            lastImageIdRef.current = null;
          },
        });
      } else if (lastImageIdRef.current === null && nearestImage) {
        // Coming back from locked state - we'll recreate the entity
        // by setting lastImageIdRef to null to force the next effect to run
        lastImageIdRef.current = null;
      }
    }
    cesiumSafeRequestRender(viewer);
  }, [
    lockFootprint,
    outlineOpacity,
    outlineColor,
    viewerRef,
    nearestImage,
    debug,
  ]);

  useEffect(() => {
    const viewer = viewerRef.current;

    if (
      !isValidViewerInstance(viewer) ||
      !nearestImage ||
      !footprintData ||
      !isObliqueMode
    ) {
      return;
    }

    // If footprint is locked, don't create a new entity
    if (lockFootprint) {
      return;
    }

    const currentImageId = nearestImage.record.id;
    const sameImage = lastImageIdRef.current === currentImageId;

    // Only clean up and recreate entity if:
    // 1. It's a new image
    // 2. We don't already have an entity
    if (sameImage && outlineEntityRef.current) {
      // If it's the same image and we already have an entity, no need to recreate
      return;
    }

    lastImageIdRef.current = currentImageId;

    // Clean up any existing entity
    cleanupOutlineEntity(viewerRef, outlineEntityRef, debug);

    const createOpacityCallbackProperty = () => {
      return new CallbackProperty(() => {
        const newOpacity = processAnimation(
          opacityAnimationRef.current,
          viewerRef.current
        );

        // If opacity is near zero, remove the entity completely instead of just hiding it
        if (Math.abs(newOpacity) < 0.01 && outlineEntityRef.current) {
          debug &&
            console.log(
              `Oblique Footprints: Animation complete, removing outline entity`
            );
          requestAnimationFrame(() => {
            // Delay to no conflict with current updates, Remove the entity completely
            cleanupOutlineEntity(viewerRef, outlineEntityRef, debug);
          });
        }
        return outlineColor.withAlpha(newOpacity);
      }, false);
    };

    const createOutlineEntity = (positions: Cartesian3[]) => {
      if (!positions || positions.length === 0) return null;

      // Close the loop by adding the first position to the end
      const outlinePositions = [...positions, positions[0]];

      debug && console.log(`Oblique Footprints: Creating outline entity`);

      return new Entity({
        id: FOOTPRINT_OUTLINE_ID,
        name: `${OBLIQUE_DATASOURCE_PREFIX}-outline-${
          nearestImage?.record.id || ""
        }`,
        show: true,
        polyline: new PolylineGraphics({
          positions: outlinePositions,
          width: new ConstantProperty(outlineWidth),
          material: new ColorMaterialProperty(createOpacityCallbackProperty()),
          clampToGround: new ConstantProperty(true),
        }),
      });
    };

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

    if (polygonHierarchy.positions && polygonHierarchy.positions.length > 0) {
      // Create fresh animation state for this entity
      opacityAnimationRef.current = createAnimationState({
        startValue: outlineOpacity,
        targetValue: outlineOpacity,
        duration: animationDuration,
        delay: animationDelay,
        easingFunction: animationEasing,
      });

      if (isValidViewerInstance(viewer)) {
        const outlineEntity = createOutlineEntity(polygonHierarchy.positions);
        viewer.entities.add(outlineEntity);
        outlineEntityRef.current = outlineEntity;
      }
    }
    cesiumSafeRequestRender(viewer);
  }, [
    viewerRef,
    isObliqueMode,
    nearestImage,
    footprintData,
    outlineWidth,
    outlineColor,
    outlineOpacity,
    lockFootprint,
    animationDuration,
    animationDelay,
    animationEasing,
    debug,
  ]);
};

export default useFootprints;
