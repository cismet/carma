import { useCallback, useEffect, useRef, useState } from "react";
import type { Degrees, Radians } from "@carma/types";
import { Cartesian3, HeadingPitchRange, Matrix4 } from "cesium";
import {
  cancelAnimation,
  getOrbitPoint,
  isValidScene,
  useCesiumContext,
} from "@carma-mapping/engines/cesium";
import { degToRad, clamp, PI, TWO_PI } from "@carma-commons/math";

export type UseOrientationCubeDragParams = {
  dragThresholdPx?: number;
};

export type UseOrientationCubeDragReturn = {
  isDragging: boolean;
  isDraggingRef: React.MutableRefObject<boolean>;
  handleMouseDown: (event: React.MouseEvent<HTMLDivElement>) => void;
  handleMouseUp: () => void;
};

const MIN_PITCH: Radians = degToRad(-70 as Degrees);
const MAX_PITCH: Radians = degToRad(-30 as Degrees);
const HEADING_FACTOR = 1;
const PITCH_FACTOR = 1;

export function useOrientationCubeDrag({
  dragThresholdPx = 2,
}: UseOrientationCubeDragParams = {}): UseOrientationCubeDragReturn {
  const { animationMapRef, shouldSuspendPitchLimiterRef, sceneRef } =
    useCesiumContext();
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const isPointerDownRef = useRef(false);
  const lastMouseRef = useRef<[number, number]>([0, 0]);
  const startMouseRef = useRef<[number, number]>([0, 0]);
  const orbitPointRef = useRef<Cartesian3 | null>(null);
  const rangeRef = useRef(0);
  const targetHeadingRef = useRef(0);
  const targetPitchRef = useRef(0);
  const animFrameRef = useRef<number | null>(null);
  const previousPercentageChangedRef = useRef<number | undefined>(undefined);

  const shortestAngleDelta = (a: number, b: number) => {
    let d = (b - a + PI) % TWO_PI;
    if (d < 0) d += TWO_PI;
    return d - PI;
  };

  const stepAnimation = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (
      !orbitPointRef.current ||
      !isDraggingRef.current ||
      !isValidScene(scene)
    ) {
      animFrameRef.current = null;
      return;
    }
    const { camera } = scene;
    const currentHeading = camera.heading;
    const currentPitch = camera.pitch;
    const targetH = targetHeadingRef.current;
    const targetP = targetPitchRef.current;
    const easing = 0.25;
    const dh = shortestAngleDelta(currentHeading, targetH);
    const dp = targetP - currentPitch;
    const nextHeading = currentHeading + dh * easing;
    const nextPitch = clamp(currentPitch + dp * easing, MIN_PITCH, MAX_PITCH);
    scene.camera.lookAt(
      orbitPointRef.current!,
      new HeadingPitchRange(nextHeading, nextPitch, rangeRef.current)
    );
    animFrameRef.current = requestAnimationFrame(stepAnimation);
  }, [sceneRef]);

  const handleMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!isValidScene(sceneRef.current)) return;
      const scene = sceneRef.current;
      const { camera } = scene;
      if (event.button !== 0) return; // primary button only
      event.preventDefault();
      isPointerDownRef.current = true;
      const { clientX: x, clientY: y } = event;
      lastMouseRef.current = [x, y];
      startMouseRef.current = [x, y];
      targetHeadingRef.current = camera.heading;
      targetPitchRef.current = camera.pitch;
      const target = getOrbitPoint(scene);
      if (target) {
        const range = Cartesian3.distance(target, camera.positionWC);
        orbitPointRef.current = target;
        rangeRef.current = range;
      } else {
        orbitPointRef.current = null;
      }
    },
    [sceneRef]
  );

  const handleMouseUp = useCallback(() => {
    const scene = sceneRef.current;
    if (!isValidScene(scene)) return;
    const { camera } = scene;
    const wasDragging = isDraggingRef.current;
    isPointerDownRef.current = false;
    shouldSuspendPitchLimiterRef.current = false;
    setIsDragging(false);
    isDraggingRef.current = false;
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (!wasDragging) return;
    if (previousPercentageChangedRef.current !== undefined) {
      camera.percentageChanged = previousPercentageChangedRef.current;
    }
    camera.lookAtTransform(Matrix4.IDENTITY);
  }, [sceneRef, shouldSuspendPitchLimiterRef]);

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      const scene = sceneRef.current;
      if (!isValidScene(scene)) return;
      if (!isPointerDownRef.current) return;
      const { clientX: x, clientY: y } = event;
      const [lx, ly] = lastMouseRef.current;
      const [sx, sy] = startMouseRef.current;
      const dx = x - lx;
      const dy = y - ly;
      const totalDx = x - sx;
      const totalDy = y - sy;

      if (!isDraggingRef.current) {
        if (Math.hypot(totalDx, totalDy) < dragThresholdPx) {
          return;
        }
        shouldSuspendPitchLimiterRef.current = true;
        if (animationMapRef?.current) {
          cancelAnimation(scene, animationMapRef.current);
        }
        const { camera } = scene;
        previousPercentageChangedRef.current = camera.percentageChanged ?? 0.01;
        camera.percentageChanged = 0.002;
        setIsDragging(true);
        isDraggingRef.current = true;
        if (!animFrameRef.current) {
          animFrameRef.current = requestAnimationFrame(stepAnimation);
        }
      }

      lastMouseRef.current = [x, y];
      // update targets incrementally
      targetHeadingRef.current =
        targetHeadingRef.current + dx * 0.01 * HEADING_FACTOR;
      targetHeadingRef.current =
        ((targetHeadingRef.current + Math.PI) % TWO_PI) - Math.PI;
      targetPitchRef.current = clamp(
        targetPitchRef.current - dy * 0.01 * PITCH_FACTOR,
        MIN_PITCH,
        MAX_PITCH
      );
    };
    const onUp = () => handleMouseUp();
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [
    handleMouseUp,
    animationMapRef,
    shouldSuspendPitchLimiterRef,
    dragThresholdPx,
    stepAnimation,
    sceneRef,
  ]);

  useEffect(() => {
    return () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, []);

  return { isDragging, isDraggingRef, handleMouseDown, handleMouseUp };
}
