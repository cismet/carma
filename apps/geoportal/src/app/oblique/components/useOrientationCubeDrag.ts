import { useCallback, useEffect, useRef, useState } from "react";
import {
  Cartesian3,
  HeadingPitchRange,
  Matrix4,
  CesiumMath,
  type Camera,
} from "@carma/cesium";
import {
  cancelSceneAnimation,
  pickSceneCenter,
  useCesiumContext,
} from "@carma-mapping/engines/cesium";

export type UseOrientationCubeDragParams = {
  dragThresholdPx?: number;
};

export type UseOrientationCubeDragReturn = {
  isDragging: boolean;
  isDraggingRef: React.MutableRefObject<boolean>;
  handleMouseDown: (event: React.MouseEvent<HTMLDivElement>) => void;
  handleMouseUp: () => void;
};

const MIN_PITCH = CesiumMath.toRadians(-70);
const MAX_PITCH = CesiumMath.toRadians(-30);
const HEADING_FACTOR = 1;
const PITCH_FACTOR = 1;

export function useOrientationCubeDrag({
  dragThresholdPx = 2,
}: UseOrientationCubeDragParams = {}): UseOrientationCubeDragReturn {
  const ctx = useCesiumContext();
  const { sceneAnimationMapRef, shouldSuspendPitchLimiterRef } = ctx;
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
    let d = (b - a + Math.PI) % (2 * Math.PI);
    if (d < 0) d += 2 * Math.PI;
    return d - Math.PI;
  };

  const stepAnimation = useCallback(() => {
    if (!orbitPointRef.current || !isDraggingRef.current) {
      animFrameRef.current = null;
      return;
    }
    ctx.withViewer((viewer) => {
      const camera = viewer.camera;
      const currentHeading = camera.heading;
      const currentPitch = camera.pitch;
      const targetH = targetHeadingRef.current;
      const targetP = targetPitchRef.current;
      const easing = 0.25;
      const dh = shortestAngleDelta(currentHeading, targetH);
      const dp = targetP - currentPitch;
      const nextHeading = currentHeading + dh * easing;
      const nextPitch = CesiumMath.clamp(
        currentPitch + dp * easing,
        MIN_PITCH,
        MAX_PITCH
      );
      viewer.camera.lookAt(
        orbitPointRef.current!,
        new HeadingPitchRange(nextHeading, nextPitch, rangeRef.current)
      );
      animFrameRef.current = requestAnimationFrame(stepAnimation);
    });
  }, [ctx]);

  const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!ctx.isValidViewer()) return;
    if (event.button !== 0) return; // primary button only
    event.preventDefault();
    isPointerDownRef.current = true;
    const { clientX: x, clientY: y } = event;
    lastMouseRef.current = [x, y];
    startMouseRef.current = [x, y];
    ctx.withViewer((viewer) => {
      const camera = viewer.camera;
      targetHeadingRef.current = camera.heading;
      targetPitchRef.current = camera.pitch;
      const target = pickSceneCenter(viewer.scene);
      if (target) {
        const range = Cartesian3.distance(target, camera.positionWC);
        orbitPointRef.current = target;
        rangeRef.current = range;
      } else {
        orbitPointRef.current = null;
      }
    });
  };

  const handleMouseUp = useCallback(() => {
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
    if (!ctx.isValidViewer()) return;
    let camera: Camera | undefined;
    ctx.withViewer((viewer) => {
      camera = viewer.camera;
    });
    if (!camera) return;
    if (previousPercentageChangedRef.current !== undefined) {
      camera.percentageChanged = previousPercentageChangedRef.current;
    }
    ctx.withViewer((viewer) => {
      viewer.camera.lookAtTransform(Matrix4.IDENTITY);
    });
  }, [ctx, shouldSuspendPitchLimiterRef]);

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
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
        if (!ctx.isValidViewer()) return;
        shouldSuspendPitchLimiterRef.current = true;
        ctx.withViewer((viewer) => {
          if (sceneAnimationMapRef?.current) {
            cancelSceneAnimation(viewer.scene, sceneAnimationMapRef.current);
          }
          const camera = viewer.camera;
          previousPercentageChangedRef.current =
            camera.percentageChanged ?? 0.01;
          camera.percentageChanged = 0.002;
        });
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
        ((targetHeadingRef.current + Math.PI) % (2 * Math.PI)) - Math.PI;
      targetPitchRef.current = CesiumMath.clamp(
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
    ctx,
    sceneAnimationMapRef,
    shouldSuspendPitchLimiterRef,
    dragThresholdPx,
    stepAnimation,
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
