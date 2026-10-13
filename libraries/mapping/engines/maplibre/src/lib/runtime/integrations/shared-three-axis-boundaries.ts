import * as THREE from "three";
import { scoreCalibratedCameraAxis } from "@carma-commons/math";

/** Stable calibrated cameras in one metric reference frame, independent of the observer. */
export type AxisBoundarySite = Readonly<{
  id: string;
  sceneToImage: THREE.Matrix4;
  eye: THREE.Vector3;
  direction: THREE.Vector3;
}>;

export type AxisBoundaryUniforms = {
  carmaAxisBoundaryData: { value: THREE.DataTexture | null };
  carmaAxisBoundaryCount: { value: number };
  carmaAxisBoundaryDataSize: { value: THREE.Vector2 };
  carmaAxisBoundarySceneToMetric: { value: THREE.Matrix4 };
  carmaAxisBoundaryColor: { value: THREE.Color };
  /** Enabled, opacity, CSS line width, reserved. */
  carmaAxisBoundaryStyle: { value: THREE.Vector4 };
  carmaAxisBoundaryPixelRatio: { value: number };
};

export type AxisBoundaryReceiver = {
  uniforms: AxisBoundaryUniforms;
  /** Bounds must be in the sites' fixed metric reference frame. Null keeps all sites. */
  setBounds: (bounds: THREE.Box3 | null) => void;
  dispose: () => void;
};

const finite = (values: readonly number[]) => values.every(Number.isFinite);
const validSite = (site: AxisBoundarySite) =>
  finite(site.sceneToImage.elements) &&
  finite(site.eye.toArray()) &&
  finite(site.direction.toArray()) &&
  site.direction.lengthSq() > 0 &&
  Number.isFinite(site.direction.lengthSq());

/** The shared best-image metric expressed as cosine; higher scores win. */
export const scoreAxisBoundarySite = (
  site: AxisBoundarySite,
  point: THREE.Vector3
): number | null => scoreCalibratedCameraAxis(site, point);

/** Signed equal-angle surface and its metric gradient, ordered by stable site ID. */
export const axisBoundaryBisector = (
  first: AxisBoundarySite,
  second: AxisBoundarySite,
  point: THREE.Vector3
): Readonly<{ difference: number; gradient: THREE.Vector3 }> | null => {
  const [a, b] = first.id <= second.id ? [first, second] : [second, first];
  const aScore = scoreAxisBoundarySite(a, point);
  const bScore = scoreAxisBoundarySite(b, point);
  if (aScore === null || bScore === null) return null;
  const gradient = (site: AxisBoundarySite, cosine: number) => {
    const ray = point.clone().sub(site.eye);
    const distance = ray.length();
    return site.direction
      .clone()
      .normalize()
      .addScaledVector(ray.divideScalar(distance), -cosine)
      .divideScalar(distance);
  };
  return {
    difference: aScore - bScore,
    gradient: gradient(a, aScore).sub(gradient(b, bScore)),
  };
};

const usableBounds = (bounds: THREE.Box3 | null | undefined) =>
  bounds &&
  (bounds.isEmpty() ||
    finite([...bounds.min.toArray(), ...bounds.max.toArray()]))
    ? bounds
    : null;

const SENSOR_ROUNDING_MARGIN = 8 * 2 ** -23;
const sourcePlanes = new WeakMap<
  THREE.Matrix4,
  {
    elements: Float64Array;
    planes: Float64Array;
  }
>();

/** Five full-sensor homogeneous halfspaces, prepared once for each calibration. */
const sensorHalfspaces = (matrix: THREE.Matrix4): Float64Array | null => {
  const e = matrix.elements;
  if (!finite(e)) return null;
  const previous = sourcePlanes.get(matrix);
  if (previous) {
    let unchanged = true;
    for (let index = 0; index < 16; index++)
      if (previous.elements[index] !== e[index]) {
        unchanged = false;
        break;
      }
    if (unchanged) return previous.planes;
  }
  const planes = new Float64Array(20);
  for (let column = 0; column < 4; column++) {
    const x = e[column * 4];
    const y = e[column * 4 + 1];
    const w = e[column * 4 + 3];
    planes[column] = x;
    planes[4 + column] = w - x;
    planes[8 + column] = y;
    planes[12 + column] = w - y;
    planes[16 + column] = w;
  }
  sourcePlanes.set(matrix, { elements: Float64Array.from(e), planes });
  return planes;
};

const admittedSiteIndices = (
  prepared: readonly (Float64Array | null)[],
  bounds: THREE.Box3 | null
): number[] => {
  if (bounds?.isEmpty()) return [];
  const result: number[] = [];
  const box = usableBounds(bounds);
  if (!box) {
    for (let index = 0; index < prepared.length; index++) result.push(index);
    return result;
  }
  const { min, max } = box;
  const absX = Math.max(Math.abs(min.x), Math.abs(max.x));
  const absY = Math.max(Math.abs(min.y), Math.abs(max.y));
  const absZ = Math.max(Math.abs(min.z), Math.abs(max.z));
  for (let index = 0; index < prepared.length; index++) {
    const planes = prepared[index];
    let outside = false;
    if (planes)
      for (let offset = 0; offset < 20; offset += 4) {
        const x = planes[offset],
          y = planes[offset + 1],
          z = planes[offset + 2],
          d = planes[offset + 3];
        const maximum =
          x * (x >= 0 ? max.x : min.x) +
          y * (y >= 0 ? max.y : min.y) +
          z * (z >= 0 ? max.z : min.z) +
          d;
        const magnitude =
          Math.abs(x) * absX +
          Math.abs(y) * absY +
          Math.abs(z) * absZ +
          Math.abs(d);
        // Retain float32-ambiguous boundaries, never approximate the winner field.
        if (maximum < -magnitude * SENSOR_ROUNDING_MARGIN) {
          outside = true;
          break;
        }
      }
    if (!outside) result.push(index);
  }
  return result;
};

/** Reject only boxes wholly outside one sensor halfspace. Matrix mutation is
 * detected; immutable calibrations reuse numeric planes without per-site allocation. */
export const cullAxisBoundarySites = (
  sites: readonly AxisBoundarySite[],
  bounds?: THREE.Box3 | null
): readonly AxisBoundarySite[] => {
  if (bounds?.isEmpty()) return [];
  if (!usableBounds(bounds)) return sites;
  return admittedSiteIndices(
    sites.map((site) => sensorHalfspaces(site.sceneToImage)),
    bounds ?? null
  ).map((index) => sites[index]);
};

/** Enclose box ∩ observer frustum in metric coordinates. This is only a
 * conservative accelerator: the angular field itself never depends on the view.
 * Flat/point boxes remain valid. Empty intersections return an empty Box3;
 * invalid or numerically ambiguous clipping retains the original box. */
export const axisBoundaryVisibleBounds = (
  bounds: THREE.Box3,
  metricToClip: THREE.Matrix4
): THREE.Box3 => {
  const fallback = () => bounds.clone();
  if (bounds.isEmpty()) return fallback();
  if (
    !usableBounds(bounds) ||
    !finite(metricToClip.elements) ||
    metricToClip.determinant() === 0
  )
    return fallback();
  const e = metricToClip.elements;
  const planes = new Float64Array(48);
  const { min, max } = bounds;
  planes.set([
    1,
    0,
    0,
    -min.x,
    -1,
    0,
    0,
    max.x,
    0,
    1,
    0,
    -min.y,
    0,
    -1,
    0,
    max.y,
    0,
    0,
    1,
    -min.z,
    0,
    0,
    -1,
    max.z,
  ]);
  for (let row = 0; row < 3; row++)
    for (let side = 0; side < 2; side++) {
      const offset = 24 + (row * 2 + side) * 4;
      const sign = side === 0 ? 1 : -1;
      for (let column = 0; column < 4; column++)
        planes[offset + column] =
          e[column * 4 + 3] + sign * e[column * 4 + row];
      const length = Math.hypot(
        planes[offset],
        planes[offset + 1],
        planes[offset + 2]
      );
      if (!(length > 0) || !Number.isFinite(length)) return fallback();
      for (let column = 0; column < 4; column++)
        planes[offset + column] /= length;
    }
  const enclosure = new THREE.Box3();
  const point = new THREE.Vector3();
  const boundaryTolerance = 1e-7;
  const expansion = 0.001;
  const coordinateBounds = [
    Math.max(Math.abs(min.x), Math.abs(max.x)) + expansion,
    Math.max(Math.abs(min.y), Math.abs(max.y)) + expansion,
    Math.max(Math.abs(min.z), Math.abs(max.z)) + expansion,
  ];
  for (let a = 0; a < 40; a += 4)
    for (let b = a + 4; b < 44; b += 4)
      for (let c = b + 4; c < 48; c += 4) {
        const ax = planes[a],
          ay = planes[a + 1],
          az = planes[a + 2],
          ad = planes[a + 3];
        const bx = planes[b],
          by = planes[b + 1],
          bz = planes[b + 2],
          bd = planes[b + 3];
        const cx = planes[c],
          cy = planes[c + 1],
          cz = planes[c + 2],
          cd = planes[c + 3];
        const bcx = by * cz - bz * cy,
          bcy = bz * cx - bx * cz,
          bcz = bx * cy - by * cx;
        const determinant = ax * bcx + ay * bcy + az * bcz;
        if (determinant === 0) continue;
        const nx =
          -ad * bcx - bd * (cy * az - cz * ay) - cd * (ay * bz - az * by);
        const ny =
          -ad * bcy - bd * (cz * ax - cx * az) - cd * (az * bx - ax * bz);
        const nz =
          -ad * bcz - bd * (cx * ay - cy * ax) - cd * (ax * by - ay * bx);
        if (Math.abs(determinant) < 1e-12) {
          const error =
            (Math.abs(ad) + Math.abs(bd) + Math.abs(cd) + 1) *
            Number.EPSILON *
            64;
          // A poorly conditioned intersection that might lie inside the box cannot
          // establish tighter bounds. Parallel triples provably outside are safe.
          if (
            Math.abs(nx) <=
              Math.abs(determinant) * coordinateBounds[0] + error &&
            Math.abs(ny) <=
              Math.abs(determinant) * coordinateBounds[1] + error &&
            Math.abs(nz) <= Math.abs(determinant) * coordinateBounds[2] + error
          )
            return fallback();
          continue;
        }
        point.set(nx / determinant, ny / determinant, nz / determinant);
        if (
          !Number.isFinite(point.x) ||
          !Number.isFinite(point.y) ||
          !Number.isFinite(point.z)
        )
          return fallback();
        let inside = true;
        for (let plane = 0; plane < 48; plane += 4)
          if (
            planes[plane] * point.x +
              planes[plane + 1] * point.y +
              planes[plane + 2] * point.z +
              planes[plane + 3] <
            -boundaryTolerance
          ) {
            inside = false;
            break;
          }
        if (inside) enclosure.expandByPoint(point);
      }
  return enclosure.isEmpty() ? enclosure : enclosure.expandByScalar(expansion);
};

/** WebGL2 dynamic loop: runtime site counts never compile shader variants. */
export const AXIS_BOUNDARY_FRAGMENT_HEADER = /* glsl */ `
uniform sampler2D carmaAxisBoundaryData;
uniform int carmaAxisBoundaryCount;
uniform vec2 carmaAxisBoundaryDataSize;
uniform mat4 carmaAxisBoundarySceneToMetric;
uniform vec3 carmaAxisBoundaryColor;
uniform vec4 carmaAxisBoundaryStyle;
uniform float carmaAxisBoundaryPixelRatio;
#ifdef CARMA_AXIS_BOUNDARY_DISPLAY_SURFACE_DERIVATIVES
vec3 carmaAxisBoundaryDisplayPointDx;
vec3 carmaAxisBoundaryDisplayPointDy;
#endif
#ifdef CARMA_AXIS_BOUNDARY_DISPLAY_INDEXED_PASS
uniform sampler2D carmaAxisBoundaryDisplayIndices;
uniform vec2 carmaAxisBoundaryDisplayIndicesSize;
uniform int carmaAxisBoundaryDisplayIndexCount;
int carmaAxisBoundarySourceIndex(int index) {
  int width = int(carmaAxisBoundaryDisplayIndicesSize.x);
  float source = texelFetch(carmaAxisBoundaryDisplayIndices,
    ivec2(index % width,index / width),0).r;
  return int(floor(source + 0.5));
}
#define CARMA_AXIS_BOUNDARY_PASS_COUNT carmaAxisBoundaryDisplayIndexCount
#else
#define CARMA_AXIS_BOUNDARY_PASS_COUNT carmaAxisBoundaryCount
int carmaAxisBoundarySourceIndex(int index) { return index; }
#endif
`;

export const AXIS_BOUNDARY_FRAGMENT_FUNCTION = /* glsl */ `
vec4 carmaAxisBoundaryTexel(int site, int offset) {
  int address = site * 6 + offset;
  int width = int(carmaAxisBoundaryDataSize.x);
  return texelFetch(carmaAxisBoundaryData,ivec2(address % width,address / width),0);
}
vec4 carmaAxisBoundaryContour(vec3 scenePosition) {
#ifndef CARMA_AXIS_BOUNDARY_TILED_PASS
  // A large full-screen loop can trigger the GPU watchdog. Dense regions are
  // rendered only by the progressive pass with an explicit pixel-work budget.
  if (CARMA_AXIS_BOUNDARY_PASS_COUNT > 128) return vec4(0.0);
#endif
  if (carmaAxisBoundaryStyle.x <= 0.0 || carmaAxisBoundaryStyle.y <= 0.0 ||
      carmaAxisBoundaryStyle.z <= 0.0 || CARMA_AXIS_BOUNDARY_PASS_COUNT < 2)
    return vec4(0.0);
  vec4 metric = carmaAxisBoundarySceneToMetric * vec4(scenePosition,1.0);
  if (metric.w == 0.0) return vec4(0.0);
  vec3 point = metric.xyz / metric.w;
#ifdef CARMA_AXIS_BOUNDARY_DISPLAY_SURFACE_DERIVATIVES
  vec3 pointDx = carmaAxisBoundaryDisplayPointDx;
  vec3 pointDy = carmaAxisBoundaryDisplayPointDy;
  vec3 pointWidth = abs(pointDx)+abs(pointDy);
#else
  vec3 pointDx = dFdx(point);
  vec3 pointDy = dFdy(point);
  vec3 pointWidth = fwidth(point);
#endif
  float best = -2.0;
  float second = -2.0;
  int bestId = -1;
  int secondId = -1;
  vec3 bestGradient = vec3(0.0);
  vec3 secondGradient = vec3(0.0);
  vec3 bestEye = vec3(0.0);
  vec3 secondEye = vec3(0.0);
  vec3 bestDirection = vec3(0.0);
  vec3 secondDirection = vec3(0.0);
  for (int site = 0; site < CARMA_AXIS_BOUNDARY_PASS_COUNT; site++) {
    int sourceSite = carmaAxisBoundarySourceIndex(site);
    vec4 homogeneous = vec4(point,1.0);
    float x = dot(carmaAxisBoundaryTexel(sourceSite,0),homogeneous);
    float y = dot(carmaAxisBoundaryTexel(sourceSite,1),homogeneous);
    float w = dot(carmaAxisBoundaryTexel(sourceSite,3),homogeneous);
    if (w <= 0.0 || x < 0.0 || x > w || y < 0.0 || y > w) continue;
    vec3 eye = carmaAxisBoundaryTexel(sourceSite,4).xyz;
    vec3 direction = carmaAxisBoundaryTexel(sourceSite,5).xyz;
    // Distinct frusta of an identical axis contribute their union coverage,
    // but must not occupy both ranks and hide a third field's boundary.
    if ((bestId >= 0 && all(equal(eye,bestEye)) && all(equal(direction,bestDirection))) ||
        (secondId >= 0 && all(equal(eye,secondEye)) && all(equal(direction,secondDirection))))
      continue;
    vec3 ray = point - eye;
    float distanceSquared = dot(ray,ray);
    if (distanceSquared <= 0.0) continue;
    float inverseDistance = inversesqrt(distanceSquared);
    ray *= inverseDistance;
    float cosine = clamp(dot(ray,direction),-1.0,1.0);
    if (cosine > best) {
      second = best; secondId = bestId; secondGradient = bestGradient;
      secondEye = bestEye; secondDirection = bestDirection;
      best = cosine; bestId = sourceSite; bestEye = eye; bestDirection = direction;
      bestGradient = (direction-cosine*ray)*inverseDistance;
    } else if (cosine > second) {
      second = cosine; secondId = sourceSite; secondEye = eye; secondDirection = direction;
      secondGradient = (direction-cosine*ray)*inverseDistance;
    }
  }
  if (secondId < 0) return vec4(0.0);
  // Fix pair ordering across a winner swap; differentiating abs(best-second)
  // would cancel at exactly the boundary. Use the analytic metric gradient.
  float sign = bestId < secondId ? 1.0 : -1.0;
  float difference = (best-second)*sign;
  vec3 gradient = (bestGradient-secondGradient)*sign;
  vec2 screenGradient = vec2(dot(gradient,pointDx),dot(gradient,pointDy));
  float pixelsToScore = length(screenGradient);
  // Coincident fields or a whole equal-score surface have no isolated contour.
  if (pixelsToScore <= 0.0 || dot(abs(gradient),pointWidth) <= 0.0)
    return vec4(0.0);
  float distancePixels = abs(difference) / pixelsToScore;
  float halfWidth = carmaAxisBoundaryStyle.z * carmaAxisBoundaryPixelRatio * 0.5;
  float aa = (abs(screenGradient.x)+abs(screenGradient.y)) / pixelsToScore * 0.5;
  float alpha = 1.0-smoothstep(max(0.0,halfWidth-aa),halfWidth+aa,distancePixels);
  return vec4(carmaAxisBoundaryColor,alpha*carmaAxisBoundaryStyle.y);
}
`;

type PackedSites = {
  key: string;
  boundsKey: string;
  texture: THREE.DataTexture;
  size: THREE.Vector2;
  count: number;
  references: number;
  lastUsed: number;
};
type ReceiverState = {
  bounds: THREE.Box3 | null;
  packed: PackedSites | null;
  uniforms: AxisBoundaryUniforms;
  disposed: boolean;
};

/** Owns complete calibrated sites and shared, conservatively culled receiver data.
 * Active receivers retain their textures; only unused entries participate in LRU. */
export const createSharedThreeAxisBoundaries = (
  options: Readonly<{ maxTextureSize?: number; maxUnusedEntries?: number }> = {}
) => {
  const maxTextureSize = Math.max(
    6,
    Math.floor(options.maxTextureSize ?? 4096)
  );
  const maxUnusedEntries = Math.max(
    0,
    Math.floor(options.maxUnusedEntries ?? 32)
  );
  const shared = {
    carmaAxisBoundarySceneToMetric: { value: new THREE.Matrix4() },
    carmaAxisBoundaryColor: { value: new THREE.Color(0xffcf40) },
    carmaAxisBoundaryStyle: { value: new THREE.Vector4(0, 0.8, 1, 0) },
    carmaAxisBoundaryPixelRatio: { value: 1 },
  };
  let sites: readonly AxisBoundarySite[] = [];
  let preparedPlanes: readonly (Float64Array | null)[] = [];
  let revision = 0;
  let clock = 0;
  let disposed = false;
  const cache = new Map<string, PackedSites>();
  // Angular preferences do not change sensor admission. Cache indices separately
  // from packed directions, so a pitch change never repeats receiver-plane work.
  const admittedByBounds = new Map<string, readonly number[]>();
  const receivers = new Set<ReceiverState>();
  const boundsKey = (bounds: THREE.Box3 | null) =>
    bounds
      ? [...bounds.min.toArray(), ...bounds.max.toArray()].join(",")
      : "all";
  const collect = () => {
    const unused = [...cache.values()]
      .filter((entry) => entry.references === 0)
      .sort((a, b) => b.lastUsed - a.lastUsed);
    unused.forEach((entry, index) => {
      if (!entry.key.startsWith(`${revision}:`) || index >= maxUnusedEntries) {
        cache.delete(entry.key);
        entry.texture.dispose();
      }
    });
    const retainedBounds = new Set(
      [...cache.values()].map((entry) => entry.boundsKey)
    );
    admittedByBounds.forEach((_, key) => {
      if (!retainedBounds.has(key)) admittedByBounds.delete(key);
    });
  };
  const pack = (bounds: THREE.Box3 | null): PackedSites => {
    const key = `${revision}:${boundsKey(bounds)}`;
    const existing = cache.get(key);
    if (existing) {
      existing.lastUsed = ++clock;
      return existing;
    }
    const receiverBoundsKey = boundsKey(bounds);
    let admitted = admittedByBounds.get(receiverBoundsKey);
    if (!admitted) {
      admitted = admittedSiteIndices(preparedPlanes, bounds);
      admittedByBounds.set(receiverBoundsKey, admitted);
    }
    const candidates = admitted.map((index) => sites[index]);
    const sitesPerRow = Math.max(
      1,
      Math.min(candidates.length, Math.floor(maxTextureSize / 6))
    );
    const width = sitesPerRow * 6;
    const height = Math.max(1, Math.ceil(candidates.length / sitesPerRow));
    if (height > maxTextureSize)
      throw new RangeError(
        "Axis boundary sites exceed the GPU texture capacity; no candidates were truncated."
      );
    const values = new Float32Array(width * height * 4);
    candidates.forEach((site, index) => {
      const base = index * 24;
      const e = site.sceneToImage.elements;
      for (let row = 0; row < 4; row++)
        for (let column = 0; column < 4; column++)
          values[base + row * 4 + column] = e[row + column * 4];
      values.set(site.eye.toArray(), base + 16);
      values.set(site.direction.toArray(), base + 20);
    });
    const texture = new THREE.DataTexture(
      values,
      width,
      height,
      THREE.RGBAFormat,
      THREE.FloatType
    );
    texture.minFilter = texture.magFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.flipY = false;
    texture.needsUpdate = true;
    const entry = {
      key,
      boundsKey: receiverBoundsKey,
      texture,
      size: new THREE.Vector2(width, height),
      count: candidates.length,
      references: 0,
      lastUsed: ++clock,
    };
    cache.set(key, entry);
    return entry;
  };
  const rebind = (receiver: ReceiverState) => {
    const next = pack(receiver.bounds);
    if (next === receiver.packed) return;
    next.references++;
    if (receiver.packed) receiver.packed.references--;
    receiver.packed = next;
    receiver.uniforms.carmaAxisBoundaryData.value = next.texture;
    receiver.uniforms.carmaAxisBoundaryCount.value = next.count;
    receiver.uniforms.carmaAxisBoundaryDataSize.value.copy(next.size);
  };
  const equalSite = (a: AxisBoundarySite, b: AxisBoundarySite) =>
    a.id === b.id &&
    a.sceneToImage.equals(b.sceneToImage) &&
    a.eye.equals(b.eye) &&
    a.direction.equals(b.direction);

  return {
    setSites(input: readonly AxisBoundarySite[]): boolean {
      if (disposed) return false;
      const next = input
        .filter(validSite)
        .map((site) => ({
          id: site.id,
          sceneToImage: site.sceneToImage.clone(),
          eye: site.eye.clone(),
          direction: site.direction.clone().normalize(),
        }))
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      if (
        next.length === sites.length &&
        next.every((site, i) => equalSite(site, sites[i]))
      )
        return false;
      const coverageChanged =
        next.length !== sites.length ||
        next.some(
          (site, i) =>
            site.id !== sites[i].id ||
            !site.sceneToImage.equals(sites[i].sceneToImage)
        );
      if (coverageChanged) {
        admittedByBounds.clear();
        preparedPlanes = next.map((site) =>
          sensorHalfspaces(site.sceneToImage)
        );
      }
      sites = next;
      revision++;
      receivers.forEach(rebind);
      collect();
      return true;
    },
    setSceneToMetric(matrix: THREE.Matrix4): void {
      if (!disposed && finite(matrix.elements))
        shared.carmaAxisBoundarySceneToMetric.value.copy(matrix);
    },
    setStyle(
      style: Readonly<{
        enabled?: boolean;
        color?: THREE.ColorRepresentation;
        opacity?: number;
        widthCss?: number;
        pixelRatio?: number;
      }>
    ): void {
      if (disposed) return;
      const value = shared.carmaAxisBoundaryStyle.value;
      if (style.enabled !== undefined) value.x = style.enabled ? 1 : 0;
      if (style.color !== undefined)
        shared.carmaAxisBoundaryColor.value.set(style.color);
      if (Number.isFinite(style.opacity))
        value.y = THREE.MathUtils.clamp(style.opacity!, 0, 1);
      if (Number.isFinite(style.widthCss))
        value.z = Math.max(0, style.widthCss!);
      if (Number.isFinite(style.pixelRatio) && style.pixelRatio! > 0)
        shared.carmaAxisBoundaryPixelRatio.value = style.pixelRatio!;
    },
    acquire(bounds?: THREE.Box3 | null): AxisBoundaryReceiver {
      const receiver: ReceiverState = {
        bounds: usableBounds(bounds)?.clone() ?? null,
        packed: null,
        disposed,
        uniforms: {
          ...shared,
          carmaAxisBoundaryData: { value: null },
          carmaAxisBoundaryCount: { value: 0 },
          carmaAxisBoundaryDataSize: { value: new THREE.Vector2(6, 1) },
        },
      };
      if (!disposed) {
        rebind(receiver);
        receivers.add(receiver);
        collect();
      }
      return {
        uniforms: receiver.uniforms,
        setBounds(bounds) {
          if (receiver.disposed) return;
          const next = usableBounds(bounds)?.clone() ?? null;
          if (boundsKey(next) === boundsKey(receiver.bounds)) return;
          receiver.bounds = next;
          rebind(receiver);
          collect();
        },
        dispose() {
          if (receiver.disposed) return;
          receiver.disposed = true;
          receivers.delete(receiver);
          if (receiver.packed) receiver.packed.references--;
          receiver.packed = null;
          receiver.uniforms.carmaAxisBoundaryData.value = null;
          receiver.uniforms.carmaAxisBoundaryCount.value = 0;
          collect();
        },
      };
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      shared.carmaAxisBoundaryStyle.value.x = 0;
      receivers.forEach((receiver) => {
        receiver.disposed = true;
        receiver.packed = null;
        receiver.uniforms.carmaAxisBoundaryData.value = null;
        receiver.uniforms.carmaAxisBoundaryCount.value = 0;
      });
      receivers.clear();
      cache.forEach((entry) => entry.texture.dispose());
      cache.clear();
      admittedByBounds.clear();
      sites = [];
      preparedPlanes = [];
    },
  };
};
