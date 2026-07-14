import type { Cartesian2, Cartesian3, Ray, Scene } from "@carma-cesium";

export type CesiumScenePickExclusionResolver = () => readonly object[];

const CESIUM_SCENE_PICK_EXCLUSION_SCOPES = {
  ALWAYS: "always",
  DRAG_SAMPLE: "drag-sample",
} as const;

type CesiumScenePickExclusionScope =
  (typeof CESIUM_SCENE_PICK_EXCLUSION_SCOPES)[keyof typeof CESIUM_SCENE_PICK_EXCLUSION_SCOPES];

type CesiumScenePickExclusionRegistration = {
  resolve: CesiumScenePickExclusionResolver;
};

type CesiumScenePickingHost = {
  registrationsByScope: Map<
    CesiumScenePickExclusionScope,
    Set<CesiumScenePickExclusionRegistration>
  >;
};

const pickingHostByScene = new WeakMap<Scene, CesiumScenePickingHost>();

type CesiumPickCollection = {
  length: number;
  get: (index: number) => object | undefined;
};

type CesiumShowablePickObject = object & {
  show: boolean;
};

export type CesiumSceneRayPickOptions = {
  includeDragSampleExclusions?: boolean;
  width?: number;
};

export type CesiumSceneRayPickResult = { position?: Cartesian3 } | undefined;

export type CesiumScenePickOptions = {
  width?: number;
  height?: number;
};

export type CesiumScenePickResult = object | undefined;

const isCesiumPickCollection = (
  candidate: object
): candidate is CesiumPickCollection => {
  const possibleCollection = candidate as Partial<CesiumPickCollection>;
  return (
    typeof possibleCollection.length === "number" &&
    Number.isInteger(possibleCollection.length) &&
    possibleCollection.length >= 0 &&
    typeof possibleCollection.get === "function"
  );
};

const addResolvedPickExclusion = (
  exclusion: object,
  exclusions: Set<object>
) => {
  if (exclusions.has(exclusion)) {
    return;
  }

  exclusions.add(exclusion);
  if (!isCesiumPickCollection(exclusion)) {
    return;
  }

  // Cesium pick results for collection-backed helpers reference the picked
  // child (for example a Polyline), not necessarily its PolylineCollection.
  // Keep registrations at the owning-object level and normalize them here,
  // where the Scene picking contract is owned.
  for (let index = 0; index < exclusion.length; index += 1) {
    try {
      const child = exclusion.get(index);
      if (child) {
        addResolvedPickExclusion(child, exclusions);
      }
    } catch {
      // Ignore collection mutation races while a tool is tearing down.
    }
  }
};

const isCesiumShowablePickObject = (
  candidate: object
): candidate is CesiumShowablePickObject =>
  typeof (candidate as Partial<CesiumShowablePickObject>).show === "boolean";

const getOrCreateCesiumScenePickingHost = (
  scene: Scene
): CesiumScenePickingHost => {
  const existingHost = pickingHostByScene.get(scene);
  if (existingHost) {
    return existingHost;
  }

  const host: CesiumScenePickingHost = {
    registrationsByScope: new Map(),
  };
  pickingHostByScene.set(scene, host);
  return host;
};

const registerExclusionResolver = (
  scene: Scene,
  scope: CesiumScenePickExclusionScope,
  resolver: CesiumScenePickExclusionResolver
): (() => void) => {
  const host = getOrCreateCesiumScenePickingHost(scene);
  const registration = { resolve: resolver };
  const registrations =
    host.registrationsByScope.get(scope) ??
    new Set<CesiumScenePickExclusionRegistration>();
  registrations.add(registration);
  host.registrationsByScope.set(scope, registrations);

  return () => {
    const currentHost = pickingHostByScene.get(scene);
    const currentRegistrations = currentHost?.registrationsByScope.get(scope);
    if (!currentHost || !currentRegistrations) {
      return;
    }

    currentRegistrations.delete(registration);
    if (currentRegistrations.size === 0) {
      currentHost.registrationsByScope.delete(scope);
    }
    if (currentHost.registrationsByScope.size === 0) {
      pickingHostByScene.delete(scene);
    }
  };
};

/** Register tool-owned helpers that must never become a picked surface. */
export const registerCesiumScenePickExclusionResolver = (
  scene: Scene,
  resolver: CesiumScenePickExclusionResolver
): (() => void) =>
  registerExclusionResolver(
    scene,
    CESIUM_SCENE_PICK_EXCLUSION_SCOPES.ALWAYS,
    resolver
  );

/**
 * Register domain geometry which a drag tool may exclude according to its
 * editing policy. Unlike tool helpers, these objects remain pickable by default.
 */
export const registerCesiumSceneDragSampleExclusionResolver = (
  scene: Scene,
  resolver: CesiumScenePickExclusionResolver
): (() => void) =>
  registerExclusionResolver(
    scene,
    CESIUM_SCENE_PICK_EXCLUSION_SCOPES.DRAG_SAMPLE,
    resolver
  );

export const getCesiumScenePickExclusions = (
  scene: Scene,
  {
    includeDragSampleExclusions = false,
  }: { includeDragSampleExclusions?: boolean } = {}
): readonly object[] => {
  const host = pickingHostByScene.get(scene);
  if (!host) {
    return [];
  }

  const scopes: CesiumScenePickExclusionScope[] = [
    CESIUM_SCENE_PICK_EXCLUSION_SCOPES.ALWAYS,
  ];
  if (includeDragSampleExclusions) {
    scopes.push(CESIUM_SCENE_PICK_EXCLUSION_SCOPES.DRAG_SAMPLE);
  }

  const exclusions = new Set<object>();
  scopes.forEach((scope) => {
    host.registrationsByScope.get(scope)?.forEach(({ resolve }) => {
      resolve().forEach((exclusion) =>
        addResolvedPickExclusion(exclusion, exclusions)
      );
    });
  });
  return [...exclusions];
};

const runWithHiddenCesiumScenePickExclusions = <T>(
  scene: Scene,
  includeDragSampleExclusions: boolean,
  pick: (exclusions: readonly object[]) => T
): T => {
  const exclusions = getCesiumScenePickExclusions(scene, {
    includeDragSampleExclusions,
  });
  const previousShowByObject = new Map<CesiumShowablePickObject, boolean>();

  exclusions.forEach((exclusion) => {
    if (!isCesiumShowablePickObject(exclusion)) {
      return;
    }
    try {
      previousShowByObject.set(exclusion, exclusion.show);
      exclusion.show = false;
    } catch {
      previousShowByObject.delete(exclusion);
    }
  });

  try {
    return pick(exclusions);
  } finally {
    previousShowByObject.forEach((show, exclusion) => {
      try {
        exclusion.show = show;
      } catch {
        // Ignore teardown races after the synchronous pick has completed.
      }
    });
  }
};

/** Pick at a screen position while every permanent tool exclusion is hidden. */
export const pickCesiumSceneAtPosition = (
  scene: Scene,
  position: Cartesian2,
  { width, height }: CesiumScenePickOptions = {}
): CesiumScenePickResult =>
  runWithHiddenCesiumScenePickExclusions(scene, false, () =>
    width === undefined && height === undefined
      ? scene.pick(position)
      : scene.pick(position, width, height)
  ) as CesiumScenePickResult;

/**
 * Pick through the Scene host so every registered exclusion is honored.
 *
 * Cesium's `objectsToExclude` only applies when the offscreen pass returns a
 * pick object. Translucent/depth-only helpers can return a position without an
 * object, so the host also hides registered showable objects for the duration
 * of the synchronous pick and restores their exact state afterwards.
 */
export const pickCesiumSceneFromRay = (
  scene: Scene,
  ray: Ray,
  { includeDragSampleExclusions = false, width }: CesiumSceneRayPickOptions = {}
): CesiumSceneRayPickResult => {
  return runWithHiddenCesiumScenePickExclusions(
    scene,
    includeDragSampleExclusions,
    (exclusions) => {
      const pickFromRay = (
        scene as Scene & {
          pickFromRay?: (
            pickRay: Ray,
            objectsToExclude?: readonly object[],
            pickWidth?: number
          ) => CesiumSceneRayPickResult;
        }
      ).pickFromRay;
      return width === undefined
        ? pickFromRay?.(ray, exclusions)
        : pickFromRay?.(ray, exclusions, width);
    }
  );
};
