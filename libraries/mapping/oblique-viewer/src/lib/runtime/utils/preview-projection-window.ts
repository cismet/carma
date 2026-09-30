import type { Map as MaplibreMap } from "maplibre-gl";

type Transform = MaplibreMap["transform"];
const descriptorFor = (
  target: object,
  name: string
): PropertyDescriptor | undefined => {
  for (
    let owner: object | null = target;
    owner;
    owner = Object.getPrototypeOf(owner)
  ) {
    const descriptor = Object.getOwnPropertyDescriptor(owner, name);
    if (descriptor) return descriptor;
  }
  return undefined;
};

/**
 * A calibrated image needs a perspective centre outside its visible crop.
 * MapLibre's EdgeInsets clamp that centre; this instance-scoped lease uses
 * the same padding without that clamp. Render matrices, picking and transform
 * clones therefore share one projection. No vendor prototype/private helper
 * is changed; releasing the lease restores the original transform members.
 */
export const acquirePreviewProjectionWindow = (
  map: MaplibreMap
): (() => void) => {
  const source = map.transform;
  let active = true;
  const wrapped = new WeakSet<Transform>();
  const members = [
    "centerPoint",
    "centerOffset",
    "getCameraPoint",
    "clone",
  ] as const;
  const leases: {
    reference: WeakRef<Transform>;
    originals: readonly (readonly [
      (typeof members)[number],
      PropertyDescriptor | undefined
    ])[];
  }[] = [];
  const install = (transform: Transform): boolean => {
    if (wrapped.has(transform)) return true;
    const point = descriptorFor(transform, "centerPoint")?.get;
    const offset = descriptorFor(transform, "centerOffset")?.get;
    if (
      !point ||
      !offset ||
      !transform.clone ||
      !transform.apply ||
      !transform.getCameraPoint
    )
      return false;
    leases.push({
      reference: new WeakRef(transform),
      originals: members.map(
        (name) =>
          [name, Object.getOwnPropertyDescriptor(transform, name)] as const
      ),
    });
    const cameraPoint = transform.getCameraPoint.bind(transform);
    const clone = transform.clone.bind(transform);
    Object.defineProperties(transform, {
      centerPoint: {
        configurable: true,
        get: () => {
          const center = point.call(transform);
          if (!active) return center;
          const result = center.clone();
          result.x =
            (transform.width +
              (transform.padding.left ?? 0) -
              (transform.padding.right ?? 0)) /
            2;
          result.y =
            (transform.height +
              (transform.padding.top ?? 0) -
              (transform.padding.bottom ?? 0)) /
            2;
          return result;
        },
      },
      centerOffset: {
        configurable: true,
        get: () => {
          if (!active) return offset.call(transform);
          const result = transform.centerPoint.clone();
          result.x -= transform.width / 2;
          result.y -= transform.height / 2;
          return result;
        },
      },
      getCameraPoint: {
        configurable: true,
        value: () =>
          active
            ? cameraPoint().add(
                transform.centerPoint.sub(point.call(transform))
              )
            : cameraPoint(),
      },
      clone: {
        configurable: true,
        value: () => {
          const copy = clone();
          if (active && install(copy)) copy.apply(transform, false);
          return copy;
        },
      },
    });
    wrapped.add(transform);
    return true;
  };
  if (!install(source)) return () => undefined;
  return () => {
    if (!active) return;
    active = false;
    for (const { reference, originals } of leases) {
      const transform = reference.deref();
      if (!transform) continue;
      for (const [name, descriptor] of originals) {
        if (descriptor) Object.defineProperty(transform, name, descriptor);
        else Reflect.deleteProperty(transform, name);
      }
      transform.apply(transform, false);
    }
  };
};
