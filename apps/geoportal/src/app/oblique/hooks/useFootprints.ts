import { MutableRefObject, useEffect, useRef, useMemo } from "react";

import {
  Color,
  ColorMaterialProperty,
  ConstantProperty,
  type Cartesian3,
} from "@carma/cesium";
import {
  Entity,
  CallbackProperty,
  PolylineGraphics,
  EntityCollection,
} from "cesium";
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
  processAnimation,
  startAnimation,
} from "../utils/animateUnitValue";

type OpacityAnimationState = AnimationState<number>;

const OBLIQUE_DATASOURCE_PREFIX = "oblq-footprint";
const FOOTPRINT_OUTLINE_ID = "oblq-footprint-outline";

const defaultFootprintsStyle: ObliqueFootprintsStyle = {
  outlineColor: COLORS.WHITE,
  outlineWidth: 5,
  outlineOpacity: 1,
};

const cleanupOutlineEntity = (
  withEntities: (callback: (entities: EntityCollection) => void) => void,
  ref: MutableRefObject<Entity | null>,
  debug = false,
  requestRender?: () => void
) => {
  debug && console.debug(`Oblique Footprints: Removing outline entity`);
  try {
    withEntities((entities) => {
      // removeById is the safe entity removal API on Cesium EntityCollection
      if (typeof entities.removeById === "function") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        entities.removeById(FOOTPRINT_OUTLINE_ID as any);
      }
    });
  } catch (e) {
    console.error("Error removing outline entity", e);
  }
  ref.current = null;
  requestRender?.();
};

export const useFootprints = (debug = false): void => {
  const { viewerRef, requestRender, isValidViewer, withEntities } =
    useCesiumContext();
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
      cleanupOutlineEntity(
        withEntities,
        outlineEntityRef,
        debug,
        requestRender
      );
    };
  }, [debug, withEntities, requestRender]);

  useEffect(() => {
    // If we're leaving oblique mode, trigger exit animation then clean up the footprint
    if (prevObliqueMode.current && !isObliqueMode) {
      // Always clean up the outline immediately
      cleanupOutlineEntity(
        withEntities,
        outlineEntityRef,
        debug,
        requestRender
      );
    }
    prevObliqueMode.current = isObliqueMode;
  }, [isObliqueMode, withEntities, debug, requestRender]);

  useEffect(() => {
    opacityAnimationRef.current.duration = animationDuration;
    opacityAnimationRef.current.delay = animationDelay;
    opacityAnimationRef.current.easingFunction = animationEasing;
  }, [animationDuration, animationDelay, animationEasing]);

  useEffect(() => {
    // When lockFootprint is set, start fade-out animation with a completion callback to clean up
    if (outlineEntityRef.current && outlineEntityRef.current.polyline) {
      if (lockFootprint) {
        startAnimation(opacityAnimationRef.current, outlineOpacity, 0.0, {
          forceStart: true,
          onComplete: () => {
            // Remove entity completely when animation finishes
            cleanupOutlineEntity(
              withEntities,
              outlineEntityRef,
              debug,
              requestRender
            );
            lastImageIdRef.current = null;
          },
        });
      } else if (lastImageIdRef.current === null && selectedImage) {
        // Coming back from locked state - we'll recreate the entity
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
    withEntities,
  ]);

  useEffect(() => {
    if (
      !isValidViewer() ||
      !selectedImage ||
      !footprintData ||
      !isObliqueMode
    ) {
      return;
    }

    // If footprint is locked, don't create a new entity
    if (lockFootprint) {
      return;
    }

    const currentImageId = selectedImage.record.id;
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
    cleanupOutlineEntity(withEntities, outlineEntityRef, debug, requestRender);

    const createOpacityCallbackProperty = () => {
      return new CallbackProperty(() => {
        const newOpacity = processAnimation(
          opacityAnimationRef.current,
          requestRender
        );

        // If opacity is near zero, remove the entity completely instead of just hiding it
        if (Math.abs(newOpacity) < 0.01 && outlineEntityRef.current) {
          debug &&
            console.debug(
              `Oblique Footprints: Animation complete, removing outline entity`
            );
          requestAnimationFrame(() => {
            // Delay to avoid conflict with current updates, then remove the entity completely
            cleanupOutlineEntity(
              withEntities,
              outlineEntityRef,
              debug,
              requestRender
            );
          });
        }
        return outlineColor.withAlpha(newOpacity);
      }, false);
    };

    const createOutlineEntity = (positions: Cartesian3[]) => {
      if (!positions || positions.length === 0) return null;

      // Close the loop by adding the first position to the end
      const outlinePositions = [...positions, positions[0]];

      debug && console.debug(`Oblique Footprints: Creating outline entity`);

      return new Entity({
        id: FOOTPRINT_OUTLINE_ID,
        name: `${OBLIQUE_DATASOURCE_PREFIX}-outline-${
          selectedImage?.record.id || ""
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
      selectedImage.record.id
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

      withEntities((entities) => {
        const outlineEntity = createOutlineEntity(polygonHierarchy.positions);
        entities.add(outlineEntity);
        outlineEntityRef.current = outlineEntity;
      });
    }
  }, [
    viewerRef,
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
    isValidViewer,
    requestRender,
    withEntities,
  ]);
};

export default useFootprints;
