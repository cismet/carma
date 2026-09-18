// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
vi.hoisted(() => {
  URL.createObjectURL = () => "blob:shader-test";
});
import {
  ELEVATION_COLOR_DATUM,
  REFERENCE_ATMOSPHERE_MODE,
  TERRAIN_GEOMETRY_MODE,
  TERRAIN_HEIGHT_DATUM,
  createReferenceFrame,
  referenceCurvatureRadii,
  referenceMountDrop,
  projectGeodeticToScene,
  elevationColorDatumNumber,
  patchEcefMeshElevationShader,
  patchTerrainReferenceShader,
  updateMeshElevationShader,
  type MeshElevationShaderBinding,
  type TerrainShaderBinding,
} from "./maplibre-three-reference-surfaces";

const frame = createReferenceFrame([7.2, 51.27], 6371000);
const field = {
  center: [7.2, 51.27] as const,
  halfExtentMeters: 60000,
  minimumMeters: 45,
  maximumMeters: 46,
  size: 2,
  values: new Float32Array(4),
  texture: new THREE.DataTexture(new Uint8Array(16), 2, 2),
};
const atmosphere = {
  mode: REFERENCE_ATMOSPHERE_MODE.OFF,
  visibilityMeters: 100000,
  scaleHeightMeters: 8500,
  observerEllipsoidalHeightMeters: 350,
  color: new THREE.Color("white"),
};
const compile = (material: THREE.Material) => {
  const shader = {
    uniforms: {},
    vertexShader:
      "#include <common>\n#include <begin_vertex>\n#include <project_vertex>",
    fragmentShader: "#include <common>\n#include <opaque_fragment>",
  };
  material.onBeforeCompile(
    shader as THREE.WebGLProgramParametersWithUniforms,
    {} as THREE.WebGLRenderer
  );
  return shader;
};
describe("elevation stripe shader contracts", () => {
  it("separates anchor-relative datum drift from topography and constant datum offset", () => {
    const anchored = createReferenceFrame(
      [7.16346125, 51.24111123],
      6371000,
      207.6
    );
    expect(referenceMountDrop(anchored, ...anchored.originLngLat)).toBeCloseTo(
      0,
      8
    );
    const radii = referenceCurvatureRadii(anchored.originLngLat[1]);
    for (const point of [
      [7.25, 51.314],
      [7.3, 51.24],
      [7.14, 51.19],
    ]) {
      const p = projectGeodeticToScene(
        anchored,
        point[0],
        point[1],
        0,
        TERRAIN_GEOMETRY_MODE.WGS84_ECEF
      );
      const quadratic =
        -(p.x ** 2) / (2 * radii.east) - p.z ** 2 / (2 * radii.north);
      expect(
        Math.abs(quadratic - referenceMountDrop(anchored, point[0], point[1]))
      ).toBeLessThan(0.01);
    }
    for (const key of [
      ELEVATION_COLOR_DATUM.RELATIVE_DHHN2016,
      ELEVATION_COLOR_DATUM.RELATIVE_ELLIPSOIDAL,
      ELEVATION_COLOR_DATUM.DATUM_DIFFERENCE,
      ELEVATION_COLOR_DATUM.MOUNT_DROP,
    ]) {
      expect(elevationColorDatumNumber(key)).toBeGreaterThan(3);
    }
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(),
      new THREE.MeshBasicMaterial()
    );
    patchEcefMeshElevationShader({
      root: mesh,
      runtimeRoot: mesh,
      frame: anchored,
      field,
      colorMinimumMeters: -2,
      colorMaximumMeters: 2,
      atmosphere,
    });
    const shader = compile(mesh.material);
    expect(shader.vertexShader).toContain(
      "return undulation - uCarmaAnchorUndulation"
    );
    expect(shader.vertexShader).toContain(
      "ellipsoidHeight - uCarmaAnchorNormalHeight - uCarmaAnchorUndulation"
    );
    expect(shader.uniforms).toMatchObject({
      uCarmaAnchorNormalHeight: { value: 207.6 },
    });
    mesh.material.dispose();
    mesh.geometry.dispose();
  });
  it("releases evicted mesh and terrain material bindings", () => {
    const meshBindings = new Set<MeshElevationShaderBinding>();
    const terrainBindings = new Set<TerrainShaderBinding>();
    const root = new THREE.Group();
    for (let index = 0; index < 40; index++) {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(),
        new THREE.MeshBasicMaterial()
      );
      patchEcefMeshElevationShader({
        root: mesh,
        runtimeRoot: root,
        frame,
        field,
        colorMinimumMeters: 0,
        colorMaximumMeters: 500,
        atmosphere,
        bindings: meshBindings,
      });
      expect(meshBindings.size).toBe(1);
      mesh.material.dispose();
      mesh.geometry.dispose();
      expect(meshBindings.size).toBe(0);
      const terrain = new THREE.Mesh(
        new THREE.PlaneGeometry(),
        new THREE.MeshLambertMaterial()
      );
      root.add(terrain);
      patchTerrainReferenceShader({
        root,
        frame,
        field,
        geometryMode: TERRAIN_GEOMETRY_MODE.WGS84_ECEF,
        heightDatum: TERRAIN_HEIGHT_DATUM.ELLIPSOIDAL,
        colorMinimumMeters: 0,
        colorMaximumMeters: 500,
        elevationColorEnabled: true,
        atmosphere,
        bindings: terrainBindings,
      });
      expect(terrainBindings.size).toBe(2); // shared depth binding + live material
      terrain.material.dispose();
      terrain.geometry.dispose();
      root.remove(terrain);
      expect(terrainBindings.size).toBe(1);
    }
  });
  it("samples the correct east/south quadrant away from the mesh mount", () => {
    const root = new THREE.Group();
    root.rotation.y = Math.PI;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(),
      new THREE.MeshBasicMaterial()
    );
    root.add(mesh);
    root.updateMatrixWorld(true);
    patchEcefMeshElevationShader({
      root,
      runtimeRoot: root,
      frame,
      field,
      colorMinimumMeters: 0,
      colorMaximumMeters: 500,
      atmosphere,
    });
    const shader = compile(mesh.material);
    const inverse = (
      shader.uniforms as Record<string, { value: THREE.Matrix4 }>
    ).uCarmaMeshRuntimeWorldInverse.value;
    const point = new THREE.Vector3(-10000, 200, -15000)
      .applyMatrix4(mesh.matrixWorld)
      .applyMatrix4(inverse);
    expect(point.x).toBeCloseTo(10000, 5);
    expect(point.z).toBeCloseTo(15000, 5);
  });
  it("uses the same unbent H/h expression for planar and bent raster vertices", () => {
    for (const mode of [
      TERRAIN_GEOMETRY_MODE.MERCATOR,
      TERRAIN_GEOMETRY_MODE.WGS84_ECEF,
    ]) {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(),
        new THREE.MeshLambertMaterial()
      );
      patchTerrainReferenceShader({
        root: mesh,
        frame,
        field,
        geometryMode: mode,
        heightDatum: TERRAIN_HEIGHT_DATUM.ELLIPSOIDAL,
        colorMinimumMeters: 0,
        colorMaximumMeters: 500,
        elevationColorEnabled: true,
        atmosphere,
        bindings: new Set(),
      });
      const shader = compile(mesh.material);
      expect(shader.vertexShader).toContain(
        "carmaReferenceElevation(carmaNormalHeight, carmaNormalHeight + carmaUndulation"
      );
      expect(shader.fragmentShader).toContain("fract(height / 100.0)");
    }
  });
  it("changes mesh datum through uniforms and subtracts undulation for H", () => {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(),
      new THREE.MeshBasicMaterial()
    );
    const bindings = new Set<MeshElevationShaderBinding>();
    patchEcefMeshElevationShader({
      root: mesh,
      runtimeRoot: mesh,
      frame,
      field,
      colorMinimumMeters: 0,
      colorMaximumMeters: 500,
      elevationIsolines: true,
      atmosphere,
      bindings,
    });
    const shader = compile(mesh.material);
    expect(shader.vertexShader).toContain(
      "carmaReferenceElevation(carmaEllipsoidHeight - carmaUndulation"
    );
    const version = mesh.material.version;
    updateMeshElevationShader(bindings, {
      colorMinimumMeters: 0,
      colorMaximumMeters: 500,
      colorDatum: ELEVATION_COLOR_DATUM.DHHN2016,
      elevationIsolines: true,
      atmosphere,
    });
    expect([...bindings][0].colorDatum.value).toBe(2);
    expect([...bindings][0].elevationIsolines.value).toBe(true);
    expect(mesh.material.version).toBe(version);
    updateMeshElevationShader(bindings, {
      colorMinimumMeters: 0,
      colorMaximumMeters: 500,
      colorDatum: ELEVATION_COLOR_DATUM.DHHN2016,
      encodedHeightDatum: TERRAIN_HEIGHT_DATUM.DHHN2016,
      atmosphere,
    });
    expect([...bindings][0].encodedHeightDatum.value).toBe(0);
    expect(mesh.material.version).toBe(version);
    expect(shader.vertexShader).toContain(
      "carmaEllipsoidHeight += (1.0 - step(0.5, uCarmaEncodedHeightDatum)) * carmaUndulation"
    );
    // Auto-scaled absolute/relative datum and sag all use the same two contour
    // levels. Range changes must not rebuild materials or discard resident tiles.
    expect(shader.fragmentShader).toContain("carmaContour(height, 0.1, 0.45)");
    expect(shader.fragmentShader).toContain("carmaContour(height, 1.0, 1.1)");
    expect(shader.fragmentShader).toContain(
      "uCarmaColorDatum > 2.5 && uCarmaColorDatum < 3.5"
    );
    for (const colorDatum of [
      ELEVATION_COLOR_DATUM.UNDULATION,
      ELEVATION_COLOR_DATUM.DATUM_DIFFERENCE,
      ELEVATION_COLOR_DATUM.MOUNT_DROP,
    ]) {
      updateMeshElevationShader(bindings, {
        colorDatum,
        colorMinimumMeters: -0.052,
        colorMaximumMeters: -0.032,
        atmosphere,
      });
      expect([...bindings][0].colorMinimum.value).toBe(-0.052);
      expect([...bindings][0].colorMaximum.value).toBe(-0.032);
      expect(mesh.material.version).toBe(version);
    }
  });
});
