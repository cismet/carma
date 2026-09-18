// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
vi.hoisted(() => {
  URL.createObjectURL = () => "blob:landmark-test";
});
import {
  LANGENBERG_LANDMARKS,
  NORDHELLE_LANDMARKS,
} from "@carma-commons/resources";
import {
  createReferenceFrame,
  projectGeodeticToScene,
  TERRAIN_GEOMETRY_MODE,
  TERRAIN_HEIGHT_DATUM,
  WGS84_REFERENCE_AXES,
  type Gcg2016ShaderField,
} from "./maplibre-three-reference-surfaces";
import { createReferenceLandmarks } from "./reference-landmarks";

const origin = [7.20158, 51.25656] as const;
const frame = createReferenceFrame(
  origin,
  WGS84_REFERENCE_AXES.defaultLocalSphereRadiusMeters
);
const field: Gcg2016ShaderField = {
  center: origin,
  halfExtentMeters: 60_000,
  minimumMeters: 45,
  maximumMeters: 45,
  size: 2,
  values: new Float32Array([45, 45, 45, 45]),
  texture: new THREE.DataTexture(),
};

describe("resource landmark mounting", () => {
  it("uses the same adapter for the independently sourced Langenberg masts", () => {
    const runtime = createReferenceLandmarks(
      frame,
      field,
      TERRAIN_GEOMETRY_MODE.WGS84_ECEF,
      TERRAIN_HEIGHT_DATUM.ELLIPSOIDAL,
      LANGENBERG_LANDMARKS
    );
    expect(runtime.root.children.map((group) => group.name)).toEqual([
      "langenberg-hordt",
      "langenberg-rommel",
    ]);
    expect(
      LANGENBERG_LANDMARKS[0].groundNormalHeightMeters +
        LANGENBERG_LANDMARKS[0].heightMeters
    ).toBeCloseTo(540.25, 2);
    runtime.dispose();
  });
  it.each(Object.values(TERRAIN_GEOMETRY_MODE))(
    "mounts every part using its own vertical in %s",
    (mode) => {
      const runtime = createReferenceLandmarks(
        frame,
        field,
        mode,
        TERRAIN_HEIGHT_DATUM.ELLIPSOIDAL
      );
      expect(runtime.root.children).toHaveLength(4);
      for (const [index, landmark] of NORDHELLE_LANDMARKS.entries()) {
        const group = runtime.root.children[index];
        expect(group.name).toBe(landmark.id);
        expect(group.children).toHaveLength(landmark.parts.length);
        for (const [partIndex, part] of landmark.parts.entries()) {
          const mesh = group.children[
            partIndex
          ] as THREE.Mesh<THREE.CylinderGeometry>;
          mesh.updateMatrix();
          const top = new THREE.Vector3(
            0,
            mesh.geometry.parameters.height / 2,
            0
          ).applyMatrix4(mesh.matrix);
          const expected = projectGeodeticToScene(
            frame,
            landmark.longitudeDegrees,
            landmark.latitudeDegrees,
            landmark.groundNormalHeightMeters +
              45 +
              part.baseHeightMeters +
              part.heightMeters,
            mode
          );
          expect(top.distanceTo(expected)).toBeLessThan(1e-5);
          expect(mesh.geometry.parameters.radiusBottom).toBeGreaterThan(0);
        }
      }
      const first = runtime.root.children[0].children[0] as THREE.Mesh;
      const geometryDispose = vi.spyOn(first.geometry, "dispose");
      const materialDispose = vi.spyOn(
        first.material as THREE.Material,
        "dispose"
      );
      runtime.dispose();
      expect(geometryDispose).toHaveBeenCalledOnce();
      expect(materialDispose).toHaveBeenCalledOnce();
      expect(runtime.root.children).toHaveLength(0);
    }
  );

  it("applies GCG once and preserves the tower's above-ground height", () => {
    const raw = createReferenceLandmarks(
      frame,
      field,
      TERRAIN_GEOMETRY_MODE.WGS84_ECEF,
      TERRAIN_HEIGHT_DATUM.DHHN2016
    );
    const corrected = createReferenceLandmarks(
      frame,
      field,
      TERRAIN_GEOMETRY_MODE.WGS84_ECEF,
      TERRAIN_HEIGHT_DATUM.ELLIPSOIDAL
    );
    const a = raw.root.children[0]
      .children[0] as THREE.Mesh<THREE.CylinderGeometry>;
    const b = corrected.root.children[0]
      .children[0] as THREE.Mesh<THREE.CylinderGeometry>;
    expect(a.position.distanceTo(b.position)).toBeCloseTo(45, 5);
    expect(a.geometry.parameters.height).toBeCloseTo(
      b.geometry.parameters.height,
      5
    );
    raw.dispose();
    corrected.dispose();
  });

  it("shows physical curvature at Nordhelle without vertical exaggeration", () => {
    const landmark = NORDHELLE_LANDMARKS[0];
    const args = [
      frame,
      landmark.longitudeDegrees,
      landmark.latitudeDegrees,
      landmark.groundNormalHeightMeters + 45,
    ] as const;
    const planar = projectGeodeticToScene(
      ...args,
      TERRAIN_GEOMETRY_MODE.MERCATOR
    );
    const curved = projectGeodeticToScene(
      ...args,
      TERRAIN_GEOMETRY_MODE.WGS84_ECEF
    );
    expect(planar.y - curved.y).toBeGreaterThan(120);
    expect(planar.y - curved.y).toBeLessThan(140);
  });
});
