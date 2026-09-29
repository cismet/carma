import * as THREE from "three";

import type { SharedThreeSceneRuntime } from "@carma-mapping/engines/maplibre";

import { VIRIDIS_GLSL } from "./reference-elevation-shader";
import {
  fieldCenterOffsetFromOrigin,
  sampleGcg2016FieldAtLocal,
  type Gcg2016ShaderField,
} from "./reference-gcg2016-field";
import {
  createReferenceFrame,
  localGroundLngLat,
  projectGeodeticToScene,
  type ReferenceFrame,
} from "./reference-surface-frame";
import {
  REFERENCE_SURFACE,
  TERRAIN_GEOMETRY_MODE,
  type ReferenceSurface,
} from "./reference-surface-types";

const SURFACE_SEGMENTS = 128;

export type ReferenceSurfaceVisibility = Readonly<{
  localTangentPlane: boolean;
  localSphere: boolean;
  ellipsoid: boolean;
  quasigeoid: boolean;
}>;

const buildReferenceSurfaceGeometry = ({
  kind,
  frame,
  field,
  halfExtentMeters,
  verticalScale,
  verticalOffsetMeters,
}: {
  kind: Exclude<ReferenceSurface, "terrain">;
  frame: ReferenceFrame;
  field: Gcg2016ShaderField;
  halfExtentMeters: number;
  verticalScale: number;
  verticalOffsetMeters: number;
}) => {
  const geometry = new THREE.PlaneGeometry(
    halfExtentMeters * 2,
    halfExtentMeters * 2,
    SURFACE_SEGMENTS,
    SURFACE_SEGMENTS
  );
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.getAttribute("position") as THREE.BufferAttribute;
  const ground = new Float32Array(position.count * 2);
  const value = new Float32Array(position.count);
  const target = new THREE.Vector3();
  const fieldCenterOffset = fieldCenterOffsetFromOrigin(
    frame.originLngLat,
    field.center
  );
  for (let index = 0; index < position.count; index += 1) {
    const eastMeters = position.getX(index);
    const southMeters = position.getZ(index);
    const [longitude, latitude] = localGroundLngLat(
      frame,
      eastMeters,
      southMeters
    );
    const undulation = sampleGcg2016FieldAtLocal(
      field,
      fieldCenterOffset,
      eastMeters,
      southMeters
    );
    if (kind === REFERENCE_SURFACE.TANGENT) {
      target.set(eastMeters, 0, southMeters);
    } else {
      projectGeodeticToScene(
        frame,
        longitude,
        latitude,
        kind === REFERENCE_SURFACE.QUASIGEOID ? undulation : 0,
        kind === REFERENCE_SURFACE.SPHERE
          ? TERRAIN_GEOMETRY_MODE.LOCAL_SPHERE
          : TERRAIN_GEOMETRY_MODE.WGS84_ECEF,
        target
      );
    }
    target.y = target.y * verticalScale + verticalOffsetMeters;
    position.setXYZ(index, target.x, target.y, target.z);
    ground[index * 2] = eastMeters;
    ground[index * 2 + 1] = southMeters;
    value[index] =
      kind === REFERENCE_SURFACE.QUASIGEOID ? undulation : target.y;
  }
  geometry.setAttribute(
    "aGroundPosition",
    new THREE.BufferAttribute(ground, 2)
  );
  geometry.setAttribute("aSurfaceValue", new THREE.BufferAttribute(value, 1));
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
};

const createReferenceSurfaceMaterial = ({
  kind,
  opacity,
  field,
}: {
  kind: Exclude<ReferenceSurface, "terrain">;
  opacity: number;
  field: Gcg2016ShaderField;
}) => {
  const mode = {
    [REFERENCE_SURFACE.TANGENT]: 0,
    [REFERENCE_SURFACE.SPHERE]: 1,
    [REFERENCE_SURFACE.ELLIPSOID]: 2,
    [REFERENCE_SURFACE.QUASIGEOID]: 3,
  }[kind];
  return new THREE.ShaderMaterial({
    name: `${kind} reference shader`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uMode: { value: mode },
      uOpacity: { value: opacity },
      uMinimum: { value: field.minimumMeters },
      uMaximum: { value: field.maximumMeters },
    },
    vertexShader: /* glsl */ `
      attribute vec2 aGroundPosition;
      attribute float aSurfaceValue;
      varying vec2 vGroundPosition;
      varying float vSurfaceValue;
      void main() {
        vGroundPosition = aGroundPosition;
        vSurfaceValue = aSurfaceValue;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uMode;
      uniform float uOpacity;
      uniform float uMinimum;
      uniform float uMaximum;
      varying vec2 vGroundPosition;
      varying float vSurfaceValue;
      ${VIRIDIS_GLSL}

      float gridLine(float spacingMeters) {
        vec2 grid = abs(fract(vGroundPosition / spacingMeters + 0.5) - 0.5);
        vec2 width = max(fwidth(vGroundPosition / spacingMeters), vec2(0.0001));
        vec2 line = 1.0 - smoothstep(vec2(0.0), width * 1.25, grid);
        return max(line.x, line.y);
      }

      void main() {
        vec3 color;
        float alpha = uOpacity;
        if (uMode < 0.5) {
          color = vec3(0.12, 0.82, 0.94);
          alpha *= 0.55;
        } else if (uMode < 1.5) {
          color = vec3(0.84, 0.24, 0.74);
          alpha *= 0.5;
        } else if (uMode < 2.5) {
          color = vec3(1.0, 0.52, 0.12);
          alpha *= 0.55;
        } else {
          float range = max(0.0001, uMaximum - uMinimum);
          color = carmaViridis((vSurfaceValue - uMinimum) / range);
        }
        color = mix(color, vec3(1.0), gridLine(1000.0) * 0.32);
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });
};

export const createReferenceSurfaceRuntime = ({
  id,
  originLngLat,
  field,
  halfExtentMeters,
  opacity,
  sphereRadiusMeters,
  verticalScale,
  verticalOffsetMeters,
  visibility,
}: {
  id: string;
  originLngLat: [number, number];
  field: Gcg2016ShaderField;
  halfExtentMeters: number;
  opacity: number;
  sphereRadiusMeters: number;
  verticalScale: number;
  verticalOffsetMeters: number;
  visibility: ReferenceSurfaceVisibility;
}): SharedThreeSceneRuntime => {
  const root = new THREE.Group();
  root.name = `${id}-root`;
  const frame = createReferenceFrame(originLngLat, sphereRadiusMeters);
  const surfaces = [
    [REFERENCE_SURFACE.TANGENT, visibility.localTangentPlane],
    [REFERENCE_SURFACE.SPHERE, visibility.localSphere],
    [REFERENCE_SURFACE.ELLIPSOID, visibility.ellipsoid],
    [REFERENCE_SURFACE.QUASIGEOID, visibility.quasigeoid],
  ] as const;
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.ShaderMaterial[] = [];
  surfaces.forEach(([kind, visible], index) => {
    const geometry = buildReferenceSurfaceGeometry({
      kind,
      frame,
      field,
      halfExtentMeters,
      verticalScale,
      verticalOffsetMeters,
    });
    const material = createReferenceSurfaceMaterial({ kind, opacity, field });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = kind;
    mesh.visible = visible;
    mesh.frustumCulled = true;
    mesh.renderOrder = index;
    root.add(mesh);
    geometries.push(geometry);
    materials.push(material);
  });

  return {
    id,
    originLngLat,
    root,
    update: () => undefined,
    hasRenderableContent: () => surfaces.some(([, visible]) => visible),
    isMainViewReady: () => true,
    getRequestDemand: () => 0,
    dispose: () => {
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      root.clear();
    },
  };
};
