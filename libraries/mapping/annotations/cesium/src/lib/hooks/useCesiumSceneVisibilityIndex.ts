import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  Cartesian3,
  SceneTransforms,
  defined,
  type Cartesian2,
  type Scene,
} from "@carma/cesium";

import {
  isPointInViewport,
  isPointOccluded,
} from "../utils/occlusionDetection";

export type SceneVisibilityIndexedPoint = {
  id: string;
  positionECEF: Cartesian3;
};

export type SceneVisibilityState = {
  isHidden: boolean;
  isOccluded: boolean;
  screenPosition: { x: number; y: number } | null;
};

export type SceneVisibilityIndexOptions = {
  shouldTestVisibility?: boolean;
  shouldTestOcclusion?: boolean;
  realtimeOcclusionPointIds?: string[];
  viewportPaddingHorizontal?: number;
  viewportPaddingVertical?: number;
  occlusionToleranceMeters?: number;
};

type PointEntry = {
  key: string;
  positionECEF: Cartesian3;
};

type RegisteredPoint = {
  id: string;
  key: string;
  positionECEF: Cartesian3;
};

type VisibilityRegistry = {
  registrationsById: Record<string, RegisteredPoint>;
  pointsByKey: Record<string, PointEntry>;
};

type ProjectedPointState = {
  point: PointEntry | null;
  canvasPosition: Cartesian2 | null;
  screenPosition: { x: number; y: number } | null;
  isInViewport: boolean;
  isHidden: boolean;
};

type CameraSnapshot = {
  position: Cartesian3;
  direction: Cartesian3;
  up: Cartesian3;
  right: Cartesian3;
  frustumNear: number;
  frustumFar: number;
  frustumFovY: number;
  frustumLeft: number;
  frustumRight: number;
  frustumTop: number;
  frustumBottom: number;
};

const DEFAULT_VIEWPORT_PADDING_HORIZONTAL = 100;
const DEFAULT_VIEWPORT_PADDING_VERTICAL = 50;
const DEFAULT_OCCLUSION_TOLERANCE_METERS = 1.0;
const CAMERA_POSITION_EPSILON_METERS = 1e-4;
const CAMERA_DIRECTION_EPSILON = 1e-6;
const CAMERA_FRUSTUM_EPSILON = 1e-6;
const POSITION_KEY_PRECISION = 1000; // millimeter precision in ECEF meters

const EMPTY_VISIBILITY_STATE: SceneVisibilityState = {
  isHidden: false,
  isOccluded: false,
  screenPosition: null,
};

const isSamePointPosition = (left: Cartesian3, right: Cartesian3) =>
  left.x === right.x && left.y === right.y && left.z === right.z;

const toRoundedInteger = (value: number) =>
  Number.isFinite(value) ? Math.round(value * POSITION_KEY_PRECISION) : 0;

const getPositionKey = (position: Cartesian3) =>
  `${toRoundedInteger(position.x)}|${toRoundedInteger(
    position.y
  )}|${toRoundedInteger(position.z)}`;

const areVisibilityStatesEqual = (
  left: SceneVisibilityState | undefined,
  right: SceneVisibilityState | undefined
) => {
  if (!left && !right) return true;
  if (!left || !right) return false;
  if (left.isHidden !== right.isHidden) return false;
  if (left.isOccluded !== right.isOccluded) return false;
  if (!left.screenPosition && !right.screenPosition) return true;
  if (!left.screenPosition || !right.screenPosition) return false;
  return (
    left.screenPosition.x === right.screenPosition.x &&
    left.screenPosition.y === right.screenPosition.y
  );
};

const toFiniteNumber = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

const getCameraSnapshot = (scene: Scene): CameraSnapshot => {
  const frustum = scene.camera.frustum as unknown as {
    near?: number;
    far?: number;
    fovy?: number;
    left?: number;
    right?: number;
    top?: number;
    bottom?: number;
  };

  return {
    position: Cartesian3.clone(scene.camera.positionWC),
    direction: Cartesian3.clone(scene.camera.directionWC),
    up: Cartesian3.clone(scene.camera.upWC),
    right: Cartesian3.clone(scene.camera.rightWC),
    frustumNear: toFiniteNumber(frustum.near),
    frustumFar: toFiniteNumber(frustum.far),
    frustumFovY: toFiniteNumber(frustum.fovy),
    frustumLeft: toFiniteNumber(frustum.left),
    frustumRight: toFiniteNumber(frustum.right),
    frustumTop: toFiniteNumber(frustum.top),
    frustumBottom: toFiniteNumber(frustum.bottom),
  };
};

const areCameraSnapshotsEqual = (
  left: CameraSnapshot | null,
  right: CameraSnapshot | null
) => {
  if (!left && !right) return true;
  if (!left || !right) return false;

  return (
    Cartesian3.distance(left.position, right.position) <=
      CAMERA_POSITION_EPSILON_METERS &&
    Cartesian3.distance(left.direction, right.direction) <=
      CAMERA_DIRECTION_EPSILON &&
    Cartesian3.distance(left.up, right.up) <= CAMERA_DIRECTION_EPSILON &&
    Cartesian3.distance(left.right, right.right) <= CAMERA_DIRECTION_EPSILON &&
    Math.abs(left.frustumNear - right.frustumNear) <= CAMERA_FRUSTUM_EPSILON &&
    Math.abs(left.frustumFar - right.frustumFar) <= CAMERA_FRUSTUM_EPSILON &&
    Math.abs(left.frustumFovY - right.frustumFovY) <= CAMERA_FRUSTUM_EPSILON &&
    Math.abs(left.frustumLeft - right.frustumLeft) <= CAMERA_FRUSTUM_EPSILON &&
    Math.abs(left.frustumRight - right.frustumRight) <=
      CAMERA_FRUSTUM_EPSILON &&
    Math.abs(left.frustumTop - right.frustumTop) <= CAMERA_FRUSTUM_EPSILON &&
    Math.abs(left.frustumBottom - right.frustumBottom) <= CAMERA_FRUSTUM_EPSILON
  );
};

const buildPointsByKeyFromRegistrations = (
  registrationsById: Record<string, RegisteredPoint>
) => {
  const pointsByKey: Record<string, PointEntry> = {};
  Object.values(registrationsById).forEach((registration) => {
    if (!pointsByKey[registration.key]) {
      pointsByKey[registration.key] = {
        key: registration.key,
        positionECEF: Cartesian3.clone(registration.positionECEF),
      };
    }
  });
  return pointsByKey;
};

export const useCesiumSceneVisibilityIndex = (
  scene: Scene | null,
  {
    shouldTestVisibility = true,
    shouldTestOcclusion = true,
    realtimeOcclusionPointIds = [],
    viewportPaddingHorizontal = DEFAULT_VIEWPORT_PADDING_HORIZONTAL,
    viewportPaddingVertical = DEFAULT_VIEWPORT_PADDING_VERTICAL,
    occlusionToleranceMeters = DEFAULT_OCCLUSION_TOLERANCE_METERS,
  }: SceneVisibilityIndexOptions = {}
) => {
  const [registry, setRegistry] = useState<VisibilityRegistry>({
    registrationsById: {},
    pointsByKey: {},
  });
  const [visibilityStateByPointKey, setVisibilityStateByPointKey] = useState<
    Record<string, SceneVisibilityState>
  >({});
  const lastCameraSnapshotRef = useRef<CameraSnapshot | null>(null);
  const registryRef = useRef<VisibilityRegistry>(registry);

  useEffect(() => {
    registryRef.current = registry;
  }, [registry]);

  const computeProjectionStateForPoint = useCallback(
    (point: PointEntry): ProjectedPointState => {
      if (!scene || scene.isDestroyed()) {
        return {
          point,
          canvasPosition: null,
          screenPosition: null,
          isInViewport: false,
          isHidden: false,
        };
      }

      const canvasPosition = SceneTransforms.worldToWindowCoordinates(
        scene,
        point.positionECEF
      );
      if (!defined(canvasPosition)) {
        return {
          point,
          canvasPosition: null,
          isHidden: shouldTestVisibility,
          screenPosition: null,
          isInViewport: false,
        };
      }

      const screenPosition = {
        x: canvasPosition.x,
        y: canvasPosition.y,
      };

      const isInViewport = isPointInViewport(
        canvasPosition,
        scene.canvas.clientWidth,
        scene.canvas.clientHeight,
        viewportPaddingHorizontal,
        viewportPaddingVertical
      );

      const isHidden = shouldTestVisibility ? !isInViewport : false;
      return {
        point,
        canvasPosition,
        isInViewport,
        isHidden,
        screenPosition,
      };
    },
    [
      scene,
      shouldTestVisibility,
      viewportPaddingHorizontal,
      viewportPaddingVertical,
    ]
  );

  const refreshByIds = useCallback(
    (
      ids: string[],
      options?: {
        skipIfCameraUnchanged?: boolean;
        includeOcclusion?: boolean;
      }
    ) => {
      if (!scene || scene.isDestroyed() || ids.length === 0) return;
      const skipIfCameraUnchanged = options?.skipIfCameraUnchanged ?? false;
      const includeOcclusion = options?.includeOcclusion ?? true;
      if (skipIfCameraUnchanged) {
        const currentCameraSnapshot = getCameraSnapshot(scene);
        if (
          areCameraSnapshotsEqual(
            lastCameraSnapshotRef.current,
            currentCameraSnapshot
          )
        ) {
          return;
        }
        lastCameraSnapshotRef.current = currentCameraSnapshot;
      }

      const currentRegistry = registryRef.current;
      const uniquePointKeys = Array.from(
        new Set(
          ids
            .map((id) => currentRegistry.registrationsById[id]?.key)
            .filter((key): key is string => Boolean(key))
        )
      );
      if (uniquePointKeys.length === 0) return;

      // Pass 1: Reproject world positions into screen space and viewport flags.
      const projectionStateByKey: Record<string, ProjectedPointState> = {};
      uniquePointKeys.forEach((key) => {
        const point = currentRegistry.pointsByKey[key] ?? null;
        if (!point) {
          projectionStateByKey[key] = {
            point: null,
            canvasPosition: null,
            screenPosition: null,
            isInViewport: false,
            isHidden: true,
          };
          return;
        }
        projectionStateByKey[key] = computeProjectionStateForPoint(point);
      });

      // Pass 2: Depth/occlusion only for points that are currently in view.
      const occlusionByKey: Record<string, boolean> = {};
      if (includeOcclusion) {
        uniquePointKeys.forEach((key) => {
          const projectedPoint = projectionStateByKey[key];
          if (!projectedPoint || !projectedPoint.point) return;

          const shouldRunOcclusionCheck =
            shouldTestOcclusion && projectedPoint.isInViewport;
          occlusionByKey[key] =
            shouldRunOcclusionCheck &&
            projectedPoint.canvasPosition &&
            scene &&
            !scene.isDestroyed()
              ? isPointOccluded(
                  scene,
                  projectedPoint.point.positionECEF,
                  projectedPoint.canvasPosition,
                  occlusionToleranceMeters
                )
              : false;
        });
      }

      startTransition(() => {
        setVisibilityStateByPointKey((prev) => {
          let changed = false;
          const next = { ...prev };

          uniquePointKeys.forEach((key) => {
            const projectedPoint = projectionStateByKey[key];
            if (!projectedPoint || !projectedPoint.point) {
              if (next[key] !== undefined) {
                delete next[key];
                changed = true;
              }
              return;
            }

            const previousState = prev[key] ?? EMPTY_VISIBILITY_STATE;
            const nextState: SceneVisibilityState = {
              isHidden: projectedPoint.isHidden,
              isOccluded: projectedPoint.isHidden
                ? false
                : includeOcclusion
                ? occlusionByKey[key] ?? false
                : previousState.isOccluded,
              screenPosition: projectedPoint.screenPosition,
            };

            if (areVisibilityStatesEqual(next[key], nextState)) return;

            next[key] = nextState;
            changed = true;
          });

          return changed ? next : prev;
        });
      });
    },
    [
      computeProjectionStateForPoint,
      occlusionToleranceMeters,
      scene,
      shouldTestOcclusion,
    ]
  );

  const refreshAll = useCallback(
    (options?: {
      skipIfCameraUnchanged?: boolean;
      includeOcclusion?: boolean;
    }) => {
      const allRegistrationIds = Object.keys(
        registryRef.current.registrationsById
      );
      if (allRegistrationIds.length === 0) return;
      refreshByIds(allRegistrationIds, options);
    },
    [refreshByIds]
  );

  const registerPoints = useCallback(
    (points: SceneVisibilityIndexedPoint[]) => {
      if (points.length === 0) return;

      setRegistry((prev) => {
        let changed = false;
        const nextRegistrationsById = { ...prev.registrationsById };

        points.forEach((point) => {
          const key = getPositionKey(point.positionECEF);
          const existing = nextRegistrationsById[point.id];
          if (
            existing &&
            existing.key === key &&
            isSamePointPosition(existing.positionECEF, point.positionECEF)
          ) {
            return;
          }

          nextRegistrationsById[point.id] = {
            id: point.id,
            key,
            positionECEF: Cartesian3.clone(point.positionECEF),
          };
          changed = true;
        });

        if (!changed) return prev;

        return {
          registrationsById: nextRegistrationsById,
          pointsByKey: buildPointsByKeyFromRegistrations(nextRegistrationsById),
        };
      });
    },
    []
  );

  const unregisterPointIds = useCallback((ids: string[]) => {
    if (ids.length === 0) return;

    setRegistry((prev) => {
      let changed = false;
      const nextRegistrationsById = { ...prev.registrationsById };
      ids.forEach((id) => {
        if (nextRegistrationsById[id] === undefined) return;
        delete nextRegistrationsById[id];
        changed = true;
      });

      if (!changed) return prev;

      return {
        registrationsById: nextRegistrationsById,
        pointsByKey: buildPointsByKeyFromRegistrations(nextRegistrationsById),
      };
    });
  }, []);

  useEffect(() => {
    const registrationIds = Object.keys(registry.registrationsById);
    setVisibilityStateByPointKey((prev) => {
      if (registrationIds.length === 0) {
        return Object.keys(prev).length === 0 ? prev : {};
      }

      const validPointKeys = new Set(
        registrationIds
          .map((id) => registry.registrationsById[id]?.key)
          .filter((key): key is string => Boolean(key))
      );

      let changed = false;
      const next = { ...prev };
      Object.keys(next).forEach((key) => {
        if (validPointKeys.has(key)) return;
        delete next[key];
        changed = true;
      });

      return changed ? next : prev;
    });
  }, [registry.registrationsById]);

  useEffect(() => {
    if (!scene || scene.isDestroyed()) return;
    const camera = scene.camera;
    // Keep per-frame work light: project all points during camera motion,
    // but defer full occlusion checks for all points to moveEnd.
    const refreshProjectionForAll = () =>
      refreshAll({
        skipIfCameraUnchanged: true,
        includeOcclusion: false,
      });
    const refreshOcclusionForAll = () =>
      refreshAll({
        includeOcclusion: true,
      });

    const removePreRenderListener = scene.preRender.addEventListener(
      refreshProjectionForAll
    );
    const removeMoveEndListener = camera.moveEnd.addEventListener(
      refreshOcclusionForAll
    );

    refreshOcclusionForAll();

    return () => {
      if (removePreRenderListener) {
        removePreRenderListener();
      }
      if (removeMoveEndListener) {
        removeMoveEndListener();
      }
    };
  }, [refreshAll, scene]);

  const registrationIdSignature = useMemo(
    () => Object.keys(registry.registrationsById).sort().join("|"),
    [registry.registrationsById]
  );

  const realtimeOcclusionSignature = useMemo(() => {
    if (realtimeOcclusionPointIds.length === 0) return "";
    const uniqueSortedIds = Array.from(
      new Set(realtimeOcclusionPointIds)
    ).sort();
    return uniqueSortedIds
      .map((id) => {
        const registration = registry.registrationsById[id];
        if (!registration) return `${id}:missing`;
        const position = registration.positionECEF;
        return `${id}:${position.x}:${position.y}:${position.z}`;
      })
      .join("|");
  }, [registry.registrationsById, realtimeOcclusionPointIds]);

  useEffect(() => {
    if (!scene || scene.isDestroyed()) return;
    // Keep projection state in sync for add/remove without running expensive depth tests.
    refreshAll({
      includeOcclusion: false,
    });
  }, [refreshAll, registrationIdSignature, scene]);

  useEffect(() => {
    if (!scene || scene.isDestroyed()) return;
    if (realtimeOcclusionPointIds.length === 0) return;

    // Optional high-priority path for interactive edits (e.g. active dragged point).
    // Recompute depth only when that point position changed.
    refreshByIds(realtimeOcclusionPointIds, {
      includeOcclusion: true,
    });
  }, [
    refreshByIds,
    realtimeOcclusionPointIds,
    realtimeOcclusionSignature,
    scene,
  ]);

  const visibilityStateById = useMemo(() => {
    const byId: Record<string, SceneVisibilityState> = {};
    Object.values(registry.registrationsById).forEach((registration) => {
      byId[registration.id] =
        visibilityStateByPointKey[registration.key] ?? EMPTY_VISIBILITY_STATE;
    });
    return byId;
  }, [registry.registrationsById, visibilityStateByPointKey]);

  return {
    registerPoints,
    unregisterPointIds,
    refreshByIds,
    refreshAll,
    visibilityStateById,
  };
};
