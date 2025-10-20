import { MutableRefObject, useEffect, useMemo, useRef } from "react";
import {
  Color,
  ColorGeometryInstanceAttribute,
  type Cartesian3,
  type Scene,
  GroundPolylinePrimitive,
  GeometryInstance,
  GroundPolylineGeometry,
  PolylineColorAppearance,
} from "@carma/cesium";

import { useMemoMergedDefaultOptions } from "@carma-commons/react";
import { Easing } from "@carma-commons/math";
import {
  useCesiumContext,
  polygonHierarchyFromPolygonCoords,
  tryWithValidScene,
} from "@carma-mapping/engines/cesium/core";

import { useOblique } from "../context/use-oblique";
import { findMatchingFeature, type FootprintFeature } from "../utils";
import type { ObliqueFootprintsStyle } from "../types";
import {
  AnimationState,
  createAnimationState,
  startAnimation,
  processAnimation,
} from "../utils";

type OpacityAnimationState = AnimationState<number>;

const FOOTPRINT_OUTLINE_ID = "oblq-footprint-outline";

const defaultFootprintsStyle: ObliqueFootprintsStyle = {
  outlineColor: Color.WHITE,
  outlineWidth: 5,
  outlineOpacity: 1,
};

const cleanupOutlineEntity = (
  scene: Scene | null,
  ref: MutableRefObject<GroundPolylinePrimitive | null>,
  debug = false,
  requestRender?: () => void
) => {
  debug && console.log(`Oblique Footprints: Removing outline primitive`);
  try {
    tryWithValidScene(scene, (validScene) => {
      if (ref.current) {
        validScene.primitives.remove(ref.current);
      }
    });
  } catch (e) {
    debug && console.error("Error removing outline primitive", e);
  }
  ref.current = null;
  requestRender?.();
};

export const useFootprints = (debug = false): void => {
  const { sceneRef, requestRender } = useCesiumContext();

  const {
    isObliqueMode,
    selectedImage,
    footprintData,
    lockFootprint,
    animations,
    footprintsStyle,
  } = useOblique();

  const { outlineColor, outlineOpacity, outlineWidth } =
    // @ts-expect-error - Type mismatch between ObliqueFootprintsStyle and Required options
    useMemoMergedDefaultOptions(footprintsStyle, defaultFootprintsStyle);

  const animationDuration = animations?.outlineFadeOut?.duration ?? 1000;
  const animationDelay = animations?.outlineFadeOut?.delay ?? 0;
  const animationEasing =
    animations?.outlineFadeOut?.easingFunction || Easing.LINEAR_NONE;

  const lastImageIdRef = useRef<string | null>(null);
  const outlineEntityRef = useRef<GroundPolylinePrimitive | null>(null);
  const prevObliqueMode = useRef<boolean>(isObliqueMode);
  const currentPositionsRef = useRef<Cartesian3[] | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);

  const startAnimationState = useMemo(
    () =>
      createAnimationState({
        startValue: outlineOpacity,
        targetValue: outlineOpacity,
        duration: animationDuration,
        delay: animationDelay,
        easingFunction: animationEasing,
      }),
    [outlineOpacity, animationDuration, animationDelay, animationEasing]
  );

  const opacityAnimationRef =
    useRef<OpacityAnimationState>(startAnimationState);

  useEffect(() => {
    const scene = sceneRef.current;
    return () => {
      if (animationFrameIdRef.current !== null) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
      cleanupOutlineEntity(scene, outlineEntityRef, debug, requestRender);
    };
  }, [sceneRef, debug, requestRender]);

  useEffect(() => {
    if (prevObliqueMode.current && !isObliqueMode) {
      cleanupOutlineEntity(
        sceneRef.current,
        outlineEntityRef,
        debug,
        requestRender
      );
    }
    prevObliqueMode.current = isObliqueMode;
  }, [isObliqueMode, sceneRef, debug, requestRender]);

  useEffect(() => {
    opacityAnimationRef.current.duration = animationDuration;
    opacityAnimationRef.current.delay = animationDelay;
    opacityAnimationRef.current.easingFunction = animationEasing;
  }, [animationDuration, animationDelay, animationEasing]);

  // Animation frame loop for smooth fadeout by replacing primitives
  useEffect(() => {
    const animateFrame = () => {
      const animState = opacityAnimationRef.current;

      if (!animState.isAnimating || !currentPositionsRef.current) {
        animationFrameIdRef.current = null;
        return;
      }

      // Calculate current opacity using processAnimation
      const currentOpacity = processAnimation(animState, requestRender);

      // Update primitive with new opacity by replacing it
      tryWithValidScene(sceneRef.current, (scene) => {
        if (outlineEntityRef.current) {
          scene.primitives.remove(outlineEntityRef.current);
          outlineEntityRef.current = null;
        }

        if (currentPositionsRef.current) {
          const outlinePositions = [
            ...currentPositionsRef.current,
            currentPositionsRef.current[0],
          ];
          const colorWithOpacity = outlineColor.withAlpha(currentOpacity);

          const newPrimitive = new GroundPolylinePrimitive({
            geometryInstances: new GeometryInstance({
              geometry: new GroundPolylineGeometry({
                positions: outlinePositions,
                width: outlineWidth,
              }),
              id: FOOTPRINT_OUTLINE_ID,
              attributes: {
                color:
                  ColorGeometryInstanceAttribute.fromColor(colorWithOpacity),
              },
            }),
            appearance: new PolylineColorAppearance(),
            asynchronous: false,
          });

          if (newPrimitive) {
            scene.primitives.add(newPrimitive);
            outlineEntityRef.current = newPrimitive;
          }
        }
        requestRender();
      });

      animationFrameIdRef.current = requestAnimationFrame(animateFrame);
    };

    // Start animation loop when fadeout begins
    const startLoop = () => {
      if (
        animationFrameIdRef.current === null &&
        opacityAnimationRef.current.isAnimating
      ) {
        animationFrameIdRef.current = requestAnimationFrame(animateFrame);
      }
    };

    // Check periodically if animation has started
    const intervalId = setInterval(() => {
      if (
        opacityAnimationRef.current.isAnimating &&
        animationFrameIdRef.current === null
      ) {
        startLoop();
      }
    }, 16); // Check every frame (~60fps)

    return () => {
      clearInterval(intervalId);
      if (animationFrameIdRef.current !== null) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
    };
  }, [outlineColor, outlineWidth, sceneRef, requestRender]);

  useEffect(() => {
    if (outlineEntityRef.current) {
      if (lockFootprint) {
        startAnimation(opacityAnimationRef.current, outlineOpacity, 0.0, {
          forceStart: true,
          onComplete: () => {
            cleanupOutlineEntity(
              sceneRef.current,
              outlineEntityRef,
              debug,
              requestRender
            );
            lastImageIdRef.current = null;
            currentPositionsRef.current = null;
          },
        });
      } else if (lastImageIdRef.current === null && selectedImage) {
        lastImageIdRef.current = null;
      }
    }
    requestRender();
  }, [
    lockFootprint,
    outlineOpacity,
    outlineColor,
    selectedImage,
    sceneRef,
    debug,
    requestRender,
  ]);

  useEffect(() => {
    if (!selectedImage || !footprintData || !isObliqueMode) {
      return;
    }

    if (lockFootprint) {
      return;
    }

    const currentImageId = selectedImage.record.id;
    const sameImage = lastImageIdRef.current === currentImageId;

    if (sameImage && outlineEntityRef.current) {
      return;
    }

    lastImageIdRef.current = currentImageId;

    cleanupOutlineEntity(
      sceneRef.current,
      outlineEntityRef,
      debug,
      requestRender
    );

    // GroundPolylinePrimitive is immutable, so we replace it to update colors
    const createOutlinePrimitive = (
      positions: Cartesian3[],
      opacity: number
    ) => {
      if (!positions || positions.length === 0) return null;

      const outlinePositions = [...positions, positions[0]];
      const colorWithOpacity = outlineColor.withAlpha(opacity);

      debug &&
        console.log(
          `Oblique Footprints: Creating outline primitive with opacity ${opacity}`
        );

      return new GroundPolylinePrimitive({
        geometryInstances: new GeometryInstance({
          geometry: new GroundPolylineGeometry({
            positions: outlinePositions,
            width: outlineWidth,
          }),
          id: FOOTPRINT_OUTLINE_ID,
          attributes: {
            color: ColorGeometryInstanceAttribute.fromColor(colorWithOpacity),
          },
        }),
        appearance: new PolylineColorAppearance(),
        asynchronous: false,
      });
    };

    const matchingFeature = findMatchingFeature(
      footprintData.features as FootprintFeature[],
      selectedImage.record.id
    );

    if (!matchingFeature) return;

    const polygonCoords = matchingFeature.geometry.coordinates.map((ring) =>
      ring.map((coord) => [coord[0], coord[1]])
    );

    const polygonHierarchy = polygonHierarchyFromPolygonCoords(polygonCoords);

    if (polygonHierarchy.positions && polygonHierarchy.positions.length > 0) {
      // Store positions for future updates
      currentPositionsRef.current = polygonHierarchy.positions;

      opacityAnimationRef.current = createAnimationState({
        startValue: outlineOpacity,
        targetValue: outlineOpacity,
        duration: animationDuration,
        delay: animationDelay,
        easingFunction: animationEasing,
      });

      tryWithValidScene(sceneRef.current, (scene) => {
        const outlinePrimitive = createOutlinePrimitive(
          polygonHierarchy.positions,
          outlineOpacity
        );
        if (outlinePrimitive) {
          scene.primitives.add(outlinePrimitive);
          outlineEntityRef.current = outlinePrimitive;
          requestRender();
        }
      });
    }
  }, [
    sceneRef,
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
