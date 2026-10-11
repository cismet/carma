import {
  BufferAttribute,
  BufferGeometry,
  Points,
  PointsMaterial,
  Vector3,
  type Camera,
  type WebGLRenderer,
} from "three";

import type { MapLibreAnnotationScene } from "./maplibre-annotation-scene";

/**
 * Point occlusion against the depth buffer the scene was just drawn into.
 * WebGL2 cannot read the default framebuffer's depth back, but it can count
 * how many samples of a draw pass the depth test: each tested point is a
 * tiny point sprite, moved toward the camera by the tolerance and drawn
 * after the surfaces with colour and depth writes off, inside an occlusion
 * query. The verdict is collected without waiting, a frame or two later, and
 * a point keeps its last verdict in between. No ray ever walks the tiles.
 */
export const MAPLIBRE_OCCLUSION_PROBE_DEFAULTS = Object.freeze({
  /** Probe size in physical pixels; a few pixels survive anti-aliased edges. */
  sizePx: 3,
  /** After every surface and every annotation primitive. */
  renderOrder: 30_000,
  /** A probe nobody asked about for this many frames is dropped. */
  idleFrames: 30,
  /** Polls for pending verdicts after the last frame before giving up. */
  idlePolls: 8,
});

type ProbeState = "idle" | "measuring" | "pending";

type Probe = {
  positionECEF: Vector3;
  toleranceMeters: number;
  points: Points<BufferGeometry, PointsMaterial>;
  query: WebGLQuery | null;
  state: ProbeState;
  occluded: boolean | null;
  lastAskedFrame: number;
};

export type MapLibreOcclusionProbes = {
  /** The last GPU verdict for a point, null before its first; keeps its probe alive. */
  read: (positionECEF: Vector3, toleranceMeters: number) => boolean | null;
  /** Changes whenever a verdict changes; part of the engine's projection snapshot. */
  getRevision: () => number;
  /** False once the context turned out to lack occlusion queries. */
  isSupported: () => boolean;
  dispose: () => void;
};

const isWebGl2 = (
  context: WebGLRenderingContext | WebGL2RenderingContext
): context is WebGL2RenderingContext =>
  typeof (context as WebGL2RenderingContext).beginQuery === "function";

export const createMapLibreOcclusionProbes = (
  scene: MapLibreAnnotationScene
): MapLibreOcclusionProbes => {
  const probes = new Map<string, Probe>();
  const material = new PointsMaterial({
    size: MAPLIBRE_OCCLUSION_PROBE_DEFAULTS.sizePx,
    sizeAttenuation: false,
    transparent: true,
    colorWrite: false,
    depthWrite: false,
    depthTest: true,
  });
  let gl: WebGL2RenderingContext | null = null;
  let unsupported = false;
  let revision = 0;
  let disposed = false;
  let pollHandle: number | null = null;
  let idlePollsLeft = 0;
  const cameraScratch = new Vector3();
  const pointScratch = new Vector3();
  const towardCamera = new Vector3();

  const resolveContext = (renderer: WebGLRenderer) => {
    if (gl || unsupported) return gl;
    const context = renderer.getContext();
    if (isWebGl2(context)) {
      gl = context;
    } else {
      unsupported = true;
    }
    return gl;
  };

  // Only the main view draw: the shared scene may render more passes per
  // frame (shadows, other cameras) whose depth is not the view's.
  const isMainPass = (camera: Camera) =>
    camera === scene.getFrame()?.renderCamera;

  const removeProbe = (key: string, probe: Probe) => {
    scene.root.remove(probe.points);
    probe.points.geometry.dispose();
    if (probe.query && gl) gl.deleteQuery(probe.query);
    probes.delete(key);
  };

  const createProbe = (
    positionECEF: Vector3,
    toleranceMeters: number
  ): Probe => {
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      "position",
      new BufferAttribute(new Float32Array(3), 3)
    );
    const points = new Points(geometry, material);
    points.frustumCulled = false;
    points.renderOrder = MAPLIBRE_OCCLUSION_PROBE_DEFAULTS.renderOrder;
    points.visible = false;
    points.raycast = () => {};
    const probe: Probe = {
      positionECEF: positionECEF.clone(),
      toleranceMeters,
      points,
      query: null,
      state: "idle",
      occluded: null,
      lastAskedFrame: scene.getFrameKey(),
    };
    points.onBeforeRender = (renderer, _scene, camera) => {
      if (probe.state !== "idle" || !isMainPass(camera)) return;
      const context = resolveContext(renderer);
      if (!context) return;
      probe.query ??= context.createQuery();
      if (!probe.query) return;
      context.beginQuery(context.ANY_SAMPLES_PASSED_CONSERVATIVE, probe.query);
      probe.state = "measuring";
    };
    points.onAfterRender = () => {
      if (probe.state !== "measuring" || !gl) return;
      gl.endQuery(gl.ANY_SAMPLES_PASSED_CONSERVATIVE);
      probe.state = "pending";
    };
    scene.root.add(points);
    return probe;
  };

  /** Collects available verdicts; true when one changed. */
  const collectVerdicts = () => {
    if (!gl) return false;
    let changed = false;
    for (const probe of probes.values()) {
      if (probe.state !== "pending" || !probe.query) continue;
      if (!gl.getQueryParameter(probe.query, gl.QUERY_RESULT_AVAILABLE)) {
        continue;
      }
      const occluded = !gl.getQueryParameter(probe.query, gl.QUERY_RESULT);
      probe.state = "idle";
      if (occluded !== probe.occluded) {
        probe.occluded = occluded;
        changed = true;
      }
    }
    if (changed) revision += 1;
    return changed;
  };

  const hasPending = () => {
    for (const probe of probes.values()) {
      if (probe.state === "pending") return true;
    }
    return false;
  };

  // Verdicts of the last frame arrive after it; poll for them between
  // frames so a static view still gets them, and draw once more when one
  // changed so the markers and labels pick it up.
  const schedulePoll = () => {
    if (pollHandle !== null || disposed) return;
    pollHandle = requestAnimationFrame(() => {
      pollHandle = null;
      if (disposed) return;
      if (collectVerdicts()) {
        scene.requestRender();
        return;
      }
      if (hasPending() && idlePollsLeft > 0) {
        idlePollsLeft -= 1;
        schedulePoll();
      }
    });
  };

  const unsubscribeFrame = scene.subscribeFrameUpdate(() => {
    if (disposed) return;
    collectVerdicts();
    const frameKey = scene.getFrameKey();
    const camera = scene.getCameraScenePosition(cameraScratch);
    for (const [key, probe] of probes) {
      if (
        frameKey - probe.lastAskedFrame >
        MAPLIBRE_OCCLUSION_PROBE_DEFAULTS.idleFrames
      ) {
        removeProbe(key, probe);
        continue;
      }
      const attribute = probe.points.geometry.getAttribute(
        "position"
      ) as BufferAttribute;
      const point = camera
        ? scene.sceneFromEcef(probe.positionECEF, pointScratch)
        : null;
      if (!camera || !point) {
        probe.points.visible = false;
        continue;
      }
      // The tolerance moves the probe toward the camera: a surface closer
      // than that to the point does not count as covering it.
      towardCamera.subVectors(camera, point);
      const range = towardCamera.length();
      if (range > 0) {
        point.addScaledVector(
          towardCamera,
          Math.min(probe.toleranceMeters, range / 2) / range
        );
      }
      attribute.setXYZ(0, point.x, point.y, point.z);
      attribute.needsUpdate = true;
      // A probe whose last query is still out is not drawn again yet.
      probe.points.visible = probe.state === "idle";
    }
  });

  const unsubscribePostRender = scene.subscribePostRender(() => {
    if (disposed || !hasPending()) return;
    idlePollsLeft = MAPLIBRE_OCCLUSION_PROBE_DEFAULTS.idlePolls;
    schedulePoll();
  });

  return {
    read: (positionECEF, toleranceMeters) => {
      if (disposed || unsupported) return null;
      const key = `${positionECEF.x}:${positionECEF.y}:${positionECEF.z}:${toleranceMeters}`;
      let probe = probes.get(key);
      if (!probe) {
        probe = createProbe(positionECEF, toleranceMeters);
        probes.set(key, probe);
        scene.requestRender();
      }
      probe.lastAskedFrame = scene.getFrameKey();
      return probe.occluded;
    },
    getRevision: () => revision,
    isSupported: () => !unsupported,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      unsubscribeFrame();
      unsubscribePostRender();
      if (pollHandle !== null) cancelAnimationFrame(pollHandle);
      for (const [key, probe] of probes) removeProbe(key, probe);
      material.dispose();
    },
  };
};
