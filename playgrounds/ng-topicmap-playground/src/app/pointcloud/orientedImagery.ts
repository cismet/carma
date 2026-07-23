import { MercatorCoordinate } from "maplibre-gl";
import type {
  CustomLayerInterface,
  CustomRenderMethodInput,
  Map as MaplibreMap,
} from "maplibre-gl";
import * as THREE from "three";

import { getFromUTM32ToWGS84 } from "@carma-geo/proj";

// ─────────────────────────────────────────────────────────────
//  Oriented imagery (wupp#4064): camera poses of the MLS
//  panoramas and the 2024 oblique flight as gizmos in the
//  three.js scene. Pose visualization follows the geoportal
//  oblique-mode concept (apps/geoportal/src/app/oblique) —
//  rebuilt as three primitives (CameraHelper-style frustum
//  lines) since the original is Cesium/DOM-bound.
//
//  Poses come from configured public HTTP sources:
//  - panoramas: reference.csv (UTM + DHHN via
//    projectedX/Y/Z columns, heading/pitch/roll in degrees)
//  - obliques: wupp-oblique exterior_orientations_utm32
//    (UTM position + photogrammetric rotation matrix rows);
//    images at /2024/{level}/{id}.jpg
// ─────────────────────────────────────────────────────────────

export const PANO_BASE = (import.meta.env.VITE_PANORAMA_BASE_URL ?? "").replace(
  /\/$/,
  ""
);
export const OBLIQUE_ORI_URL =
  "https://wupp-oblique.cismet.de/2024/metadata/exterior_orientations_utm32.noNadir.json";
export const OBLIQUE_IMAGE_URL = (id: string, level = 2) =>
  `https://wupp-oblique.cismet.de/2024/${level}/${id}.jpg`;

export interface ImagePose {
  id: string;
  kind: "pano" | "oblique";
  utm: [number, number, number];
  /** WGS84 lng/lat derived from utm */
  lngLat: [number, number];
  /** Heading in radians (pano only; 0 = north, clockwise) */
  headingRad?: number;
  /** Camera rotation rows (oblique only, UTM frame E/N/Up) */
  rotationRows?: [number[], number[], number[]];
  imageUrl: string;
}

export async function loadPanoPoses(): Promise<ImagePose[]> {
  if (!PANO_BASE) {
    throw new Error("VITE_PANORAMA_BASE_URL is not configured");
  }
  const text = await (await fetch(`${PANO_BASE}/reference.csv`)).text();
  const lines = text.trim().split("\n");
  const poses: ImagePose[] = [];
  for (const line of lines.slice(1)) {
    const cols = line.split("\t");
    if (cols.length < 11) continue;
    const name = cols[1].trim();
    const heading = Number(cols[7]);
    const x = Number(cols[8]);
    const y = Number(cols[9]);
    const z = Number(cols[10]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    poses.push({
      id: name,
      kind: "pano",
      utm: [x, y, z],
      lngLat: getFromUTM32ToWGS84([x, y]) as [number, number],
      headingRad: THREE.MathUtils.degToRad(heading),
      imageUrl: `${PANO_BASE}/${name}.jpg`,
    });
  }
  return poses;
}

export async function loadObliquePoses(
  bboxUtm: [number, number, number, number],
  maxCount = 400
): Promise<ImagePose[]> {
  const data = (await (await fetch(OBLIQUE_ORI_URL)).json()) as Record<
    string,
    [number, number, number, number[], number[], number[]]
  >;
  const [minX, minY, maxX, maxY] = bboxUtm;
  const poses: ImagePose[] = [];
  for (const [id, entry] of Object.entries(data)) {
    const [x, y, z, r1, r2, r3] = entry;
    if (x < minX || x > maxX || y < minY || y > maxY) continue;
    poses.push({
      id,
      kind: "oblique",
      utm: [x, y, z],
      lngLat: getFromUTM32ToWGS84([x, y]) as [number, number],
      rotationRows: [r1, r2, r3],
      imageUrl: OBLIQUE_IMAGE_URL(id),
    });
    if (poses.length >= maxCount) break;
  }
  return poses;
}

/** UTM (with DHHN z) → scene meters relative to the layer origin */
export const utmToScene = (
  utm: [number, number, number],
  lngLat: [number, number],
  originMerc: MercatorCoordinate,
  mScale: number
): THREE.Vector3 => {
  const merc = MercatorCoordinate.fromLngLat(lngLat, utm[2]);
  return new THREE.Vector3(
    (merc.x - originMerc.x) / mScale,
    merc.z / mScale,
    (merc.y - originMerc.y) / mScale
  );
};

/** Camera view direction in scene frame from photogrammetric R rows.
 *  UTM frame is (E, N, Up); scene frame is (E, Up, -N... i.e. south). */
export const obliqueDirectionScene = (
  rows: [number[], number[], number[]]
): THREE.Vector3 => {
  // Third row = camera z axis in world (E,N,Up); view dir = -z
  const [e, n, up] = [rows[2][0], rows[2][1], rows[2][2]];
  return new THREE.Vector3(-e, -up, n).normalize();
};

/** View-projection matrix (scene frame) for an oblique pose —
 *  interior orientation approximated (fov/aspect tunable). */
export const buildFrustumProjector = (
  pose: ImagePose,
  originMerc: MercatorCoordinate,
  mScale: number,
  fovDeg = 45,
  aspect = 1.5
): THREE.Matrix4 => {
  const rows = pose.rotationRows!;
  const toScene = (v: number[]) => new THREE.Vector3(v[0], v[2], -v[1]);
  const xCam = toScene(rows[0]);
  const yCam = toScene(rows[1]);
  const zCam = toScene(rows[2]);
  const position = utmToScene(pose.utm, pose.lngLat, originMerc, mScale);
  const view = new THREE.Matrix4().set(
    xCam.x,
    xCam.y,
    xCam.z,
    -xCam.dot(position),
    yCam.x,
    yCam.y,
    yCam.z,
    -yCam.dot(position),
    zCam.x,
    zCam.y,
    zCam.z,
    -zCam.dot(position),
    0,
    0,
    0,
    1
  );
  const projection = new THREE.Matrix4().makePerspective(
    -Math.tan(THREE.MathUtils.degToRad(fovDeg / 2)) * aspect,
    Math.tan(THREE.MathUtils.degToRad(fovDeg / 2)) * aspect,
    Math.tan(THREE.MathUtils.degToRad(fovDeg / 2)),
    -Math.tan(THREE.MathUtils.degToRad(fovDeg / 2)),
    1,
    2000
  );
  return projection.multiply(view);
};

export interface OrientedImageryLayer extends CustomLayerInterface {
  readonly poses: ImagePose[];
  /** Scene-frame positions parallel to poses */
  readonly scenePositions: THREE.Vector3[];
  setHighlight: (index: number | null) => void;
  originMerc: MercatorCoordinate;
  mScale: number;
}

const PANO_COLOR = 0x00b8d4;
const OBLIQUE_COLOR = 0xff8f00;
const HIGHLIGHT_COLOR = 0x3a7ceb;

export function buildOrientedImageryLayer(
  layerId: string,
  originLngLat: [number, number],
  poses: ImagePose[]
): OrientedImageryLayer {
  const originMerc = MercatorCoordinate.fromLngLat(originLngLat, 0);
  const mScale = originMerc.meterInMercatorCoordinateUnits();

  let map: MaplibreMap | null = null;
  let renderer: THREE.WebGLRenderer | null = null;
  const camera = new THREE.Camera();
  const scene = new THREE.Scene();
  const rotationX = new THREE.Matrix4().makeRotationAxis(
    new THREE.Vector3(1, 0, 0),
    Math.PI / 2
  );

  const scenePositions = poses.map((pose) =>
    utmToScene(pose.utm, pose.lngLat, originMerc, mScale)
  );

  const gizmos: THREE.Object3D[] = [];
  const buildGizmos = () => {
    const panoGeo = new THREE.SphereGeometry(0.5, 12, 8);
    for (let i = 0; i < poses.length; i++) {
      const pose = poses[i];
      const position = scenePositions[i];
      if (pose.kind === "pano") {
        const mat = new THREE.MeshBasicMaterial({ color: PANO_COLOR });
        const mesh = new THREE.Mesh(panoGeo, mat);
        mesh.position.copy(position);
        scene.add(mesh);
        gizmos.push(mesh);
      } else {
        // CameraHelper-style frustum lines along the view direction
        const dir = obliqueDirectionScene(pose.rotationRows!);
        const length = 25;
        const half = length * 0.35;
        const target = position.clone().addScaledVector(dir, length);
        const upHint = new THREE.Vector3(0, 1, 0);
        const right = new THREE.Vector3()
          .crossVectors(dir, upHint)
          .normalize()
          .multiplyScalar(half);
        const upv = new THREE.Vector3()
          .crossVectors(right, dir)
          .normalize()
          .multiplyScalar(half * 0.66);
        const corners = [
          target.clone().add(right).add(upv),
          target.clone().sub(right).add(upv),
          target.clone().sub(right).sub(upv),
          target.clone().add(right).sub(upv),
        ];
        const pts: THREE.Vector3[] = [];
        for (let c = 0; c < 4; c++) {
          pts.push(position, corners[c]);
          pts.push(corners[c], corners[(c + 1) % 4]);
        }
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        const line = new THREE.LineSegments(
          geo,
          new THREE.LineBasicMaterial({ color: OBLIQUE_COLOR })
        );
        scene.add(line);
        gizmos.push(line);
      }
    }
  };

  let highlighted: number | null = null;

  const layer: OrientedImageryLayer = {
    id: layerId,
    type: "custom",
    renderingMode: "3d",
    poses,
    scenePositions,
    originMerc,
    mScale,

    onAdd(mapInstance: MaplibreMap, gl: WebGL2RenderingContext) {
      map = mapInstance;
      renderer = new THREE.WebGLRenderer({
        canvas: mapInstance.getCanvas(),
        context: gl,
        antialias: true,
      });
      renderer.autoClear = false;
      buildGizmos();
    },

    render(
      gl: WebGLRenderingContext | WebGL2RenderingContext,
      options: CustomRenderMethodInput
    ) {
      if (!renderer) return;
      const m = new THREE.Matrix4().fromArray(
        options.defaultProjectionData.mainMatrix as unknown as number[]
      );
      const l = new THREE.Matrix4()
        .makeTranslation(originMerc.x, originMerc.y, originMerc.z)
        .scale(new THREE.Vector3(mScale, -mScale, mScale))
        .multiply(rotationX);
      camera.projectionMatrix = m.multiply(l);
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
      scene.traverse((object) => {
        object.frustumCulled = false;
      });
      const savedDepthRange = gl.getParameter(gl.DEPTH_RANGE) as Float32Array;
      renderer.resetState();
      renderer.render(scene, camera);
      gl.depthRange(savedDepthRange[0], savedDepthRange[1]);
    },

    setHighlight(index: number | null) {
      if (highlighted !== null && gizmos[highlighted]) {
        const prev = gizmos[highlighted] as THREE.Mesh;
        (
          prev.material as THREE.MeshBasicMaterial | THREE.LineBasicMaterial
        ).color.set(
          poses[highlighted].kind === "pano" ? PANO_COLOR : OBLIQUE_COLOR
        );
      }
      highlighted = index;
      if (index !== null && gizmos[index]) {
        const next = gizmos[index] as THREE.Mesh;
        (
          next.material as THREE.MeshBasicMaterial | THREE.LineBasicMaterial
        ).color.set(HIGHLIGHT_COLOR);
      }
      map?.triggerRepaint();
    },

    onRemove() {
      for (const gizmo of gizmos) {
        (gizmo as THREE.Mesh).geometry?.dispose?.();
      }
      renderer?.dispose();
      renderer = null;
      map = null;
    },
  };

  return layer;
}
