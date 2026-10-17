import { describe, expect, it, vi } from "vitest";
import {
  Group,
  InstancedMesh,
  Mesh,
  MeshLambertMaterial,
  PlaneGeometry,
  type WebGLRenderer,
} from "three";
import { createTerrainInstancedPresentation } from "./terrain-instanced-presentation";

const renderer = {
  capabilities: { maxTextureSize: 4096 },
  getContext: () => ({ MAX_ARRAY_TEXTURE_LAYERS: 1, getParameter: () => 8 }),
} as unknown as WebGLRenderer;
const fixture = (admitted = true) => {
  const root = new Group();
  root.position.set(10, 20, 30);
  const material = new MeshLambertMaterial();
  const meshes = [0, 1].map((x) => {
    const mesh = new Mesh(new PlaneGeometry(1, 1), material);
    mesh.position.x = x;
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData.isShadowTerrainSurface = true;
    root.add(mesh);
    return mesh;
  });
  const options = {
    admitRetainedBytes: () => admitted,
    onChanged: vi.fn(),
    onError: vi.fn(),
  };
  const presentation = createTerrainInstancedPresentation(root, options);
  return { root, material, meshes, options, presentation };
};
const visibleMeshes = (root: Group) => {
  const meshes: Mesh[] = [];
  root.traverseVisible((object) => {
    if (object instanceof Mesh) meshes.push(object);
  });
  return meshes;
};

describe("shared terrain instanced presentation", () => {
  it("keeps query geometry and renders exactly one cut with terrain shadow identity", () => {
    const { root, meshes, material, options, presentation } = fixture();
    root.updateMatrixWorld(true);
    const world = meshes.map((mesh) => mesh.matrixWorld.clone());
    presentation.update(renderer);
    const rendered = visibleMeshes(root);
    expect(rendered).toHaveLength(1);
    expect(rendered[0]).toBeInstanceOf(InstancedMesh);
    expect(rendered[0].userData).toMatchObject({
      isShadowTerrainSurface: true,
      isPreparedTerrainInstance: true,
    });
    expect(
      presentation.usesMaterial(
        rendered[0].material as MeshLambertMaterial,
        material
      )
    ).toBe(true);
    root.updateMatrixWorld(true);
    meshes.forEach((mesh, i) =>
      expect(mesh.matrixWorld.equals(world[i])).toBe(true)
    );
    const bytes = presentation.retainedBytes();
    expect(bytes).toBeGreaterThan(0);
    presentation.update(renderer);
    expect(presentation.retainedBytes()).toBe(bytes);
    expect(options.onChanged).toHaveBeenCalledTimes(1);
    presentation.dispose();
    expect(visibleMeshes(root)).toEqual(meshes);
    expect(presentation.retainedBytes()).toBe(0);
  });

  it("denies packed allocations without changing coverage or source materials", () => {
    const { root, material, meshes, presentation } = fixture(false);
    const sourceDispose = vi.spyOn(material, "dispose");
    const geometryDispose = meshes.map((mesh) =>
      vi.spyOn(mesh.geometry, "dispose")
    );
    presentation.update(renderer);
    const rendered = visibleMeshes(root);
    expect(rendered).toHaveLength(2);
    expect(presentation.retainedBytes()).toBe(0);
    rendered.forEach((mesh, i) => {
      expect(mesh.geometry).toBe(meshes[i].geometry);
      expect(mesh.material).not.toBe(material);
    });
    presentation.dispose();
    expect(visibleMeshes(root)).toEqual(meshes);
    expect(sourceDispose).not.toHaveBeenCalled();
    geometryDispose.forEach((dispose) =>
      expect(dispose).not.toHaveBeenCalled()
    );
  });

  it("restores native coverage once after incompatible renderer capabilities", () => {
    const { root, meshes, options, presentation } = fixture();
    presentation.update({
      ...renderer,
      capabilities: { maxTextureSize: 0 },
    } as WebGLRenderer);
    expect(visibleMeshes(root)).toEqual(meshes);
    expect(options.onError).toHaveBeenCalledTimes(1);
    presentation.update(renderer);
    expect(visibleMeshes(root)).toEqual(meshes);
    expect(options.onError).toHaveBeenCalledTimes(1);
    presentation.dispose();
  });

  it("retains native rendering on a context without texture arrays", () => {
    const { root, meshes, options, presentation } = fixture();
    presentation.update({
      ...renderer,
      getContext: () => ({ getParameter: () => 0 }),
    } as unknown as WebGLRenderer);
    expect(visibleMeshes(root)).toEqual(meshes);
    expect(options.onError).not.toHaveBeenCalled();
    presentation.dispose();
  });

  it("leaves standalone query-only frames untouched", () => {
    const { root, meshes, presentation } = fixture();
    presentation.update();
    expect(visibleMeshes(root)).toEqual(meshes);
    expect(presentation.root()).toBe(root);
    presentation.dispose();
  });
});
