import * as THREE from "three";

import type {
  ThreeTilesRuntimeServices,
  ThreeTilesRuntimeState,
} from "./three-tiles-runtime-context";

/** surfaces responsibility of the shared 3D Tiles runtime. */
export function createThreeTilesSurfaces(
  runtimeState: Pick<
    ThreeTilesRuntimeState,
    "separatedSurfaceRenderSides" | "normalizedSeparatedSurfaceGeometries"
  >
) {
  const isSeparatedBuildingSurface: ThreeTilesRuntimeServices["isSeparatedBuildingSurface"] =
    (material: THREE.Material) => {
      const surfaceName = material.name.trim().toLowerCase();
      return surfaceName === "roof" || surfaceName === "wall";
    };

  const isRenderedBuildingSurface: ThreeTilesRuntimeServices["isRenderedBuildingSurface"] =
    (material: THREE.Material) => {
      const sourceName = material.name.trim().toLowerCase().split(" · ", 1)[0];
      return sourceName === "roof" || sourceName === "wall";
    };

  const resolveRenderSide: ThreeTilesRuntimeServices["resolveRenderSide"] = (
    material: THREE.Material
  ) =>
    runtimeState.separatedSurfaceRenderSides.get(material) ?? THREE.FrontSide;

  const asMaterialArray: ThreeTilesRuntimeServices["asMaterialArray"] = (
    material: THREE.Material | THREE.Material[]
  ): THREE.Material[] => (Array.isArray(material) ? material : [material]);

  const normalizeSeparatedBuildingSurfaces: ThreeTilesRuntimeServices["normalizeSeparatedBuildingSurfaces"] =
    (root: THREE.Object3D) => {
      root.traverse((parent) => {
        const surfaceNames = new Set<string>();
        const parts: Array<{
          materials: THREE.Material[];
          geometry: THREE.BufferGeometry;
          position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
          featureId: THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
          index: THREE.BufferAttribute;
        }> = [];

        for (const child of parent.children) {
          const mesh = child as THREE.Mesh;
          if (!mesh.isMesh) continue;
          const geometry = mesh.geometry as THREE.BufferGeometry;
          if (runtimeState.normalizedSeparatedSurfaceGeometries.has(geometry))
            continue;
          const materials = asMaterialArray(mesh.material);
          for (const material of materials) {
            const name = material.name.trim().toLowerCase();
            if (name === "roof" || name === "wall") surfaceNames.add(name);
          }
          if (!materials.some(isSeparatedBuildingSurface)) continue;
          const position = geometry.getAttribute("position");
          const featureId = geometry.getAttribute("_feature_id_0");
          const index = geometry.getIndex();
          if (!position || !featureId || !index) continue;
          parts.push({ materials, geometry, position, featureId, index });
        }
        if (!surfaceNames.has("roof") || !surfaceNames.has("wall")) return;

        type SurfaceTriangle = {
          part: number;
          offset: number;
          featureId: number;
          indices: [number, number, number];
          vertexKeys: [string, string, string];
        };
        type SurfaceEdgeReference = {
          triangle: number;
          forward: boolean;
        };
        const coordinateKey = (
          position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
          vertex: number
        ) => {
          const precision = 10_000;
          return `${Math.round(position.getX(vertex) * precision)},${Math.round(
            position.getY(vertex) * precision
          )},${Math.round(position.getZ(vertex) * precision)}`;
        };
        const triangles: SurfaceTriangle[] = [];
        for (let part = 0; part < parts.length; part += 1) {
          const { position, featureId, index } = parts[part];
          for (let offset = 0; offset + 2 < index.count; offset += 3) {
            const first = index.getX(offset);
            const second = index.getX(offset + 1);
            const third = index.getX(offset + 2);
            const id = featureId.getX(first);
            if (featureId.getX(second) !== id || featureId.getX(third) !== id) {
              continue;
            }
            const vertexKeys: [string, string, string] = [
              coordinateKey(position, first),
              coordinateKey(position, second),
              coordinateKey(position, third),
            ];
            if (new Set(vertexKeys).size !== 3) continue;
            triangles.push({
              part,
              offset,
              featureId: id,
              indices: [first, second, third],
              vertexKeys,
            });
          }
        }

        const edges = new Map<string, SurfaceEdgeReference[]>();
        const addEdge = (
          triangle: number,
          firstVertex: number,
          secondVertex: number
        ) => {
          const surface = triangles[triangle];
          const first = surface.vertexKeys[firstVertex];
          const second = surface.vertexKeys[secondVertex];
          const forward = first < second;
          const key = `${surface.featureId}|${forward ? first : second}|${
            forward ? second : first
          }`;
          const references = edges.get(key) ?? [];
          references.push({ triangle, forward });
          edges.set(key, references);
        };
        for (let triangle = 0; triangle < triangles.length; triangle += 1) {
          addEdge(triangle, 0, 1);
          addEdge(triangle, 1, 2);
          addEdge(triangle, 2, 0);
        }

        const adjacency = Array.from(
          { length: triangles.length },
          (): Array<{ triangle: number; invert: boolean }> => []
        );
        for (const references of edges.values()) {
          if (references.length !== 2) continue;
          const [first, second] = references;
          const invert = first.forward === second.forward;
          adjacency[first.triangle].push({
            triangle: second.triangle,
            invert,
          });
          adjacency[second.triangle].push({
            triangle: first.triangle,
            invert,
          });
        }

        const triangleFlips: Array<boolean | undefined> = Array(
          triangles.length
        ).fill(undefined);
        const componentByTriangle = new Int32Array(triangles.length).fill(-1);
        const components: number[][] = [];
        const inconsistentComponents = new Set<number>();
        for (let start = 0; start < triangles.length; start += 1) {
          if (triangleFlips[start] !== undefined) continue;
          const component = components.length;
          const members: number[] = [];
          const pending = [start];
          triangleFlips[start] = false;
          while (pending.length > 0) {
            const triangle = pending.pop();
            if (triangle === undefined) break;
            members.push(triangle);
            componentByTriangle[triangle] = component;
            for (const neighbor of adjacency[triangle]) {
              const expected =
                (triangleFlips[triangle] as boolean) !== neighbor.invert;
              const current = triangleFlips[neighbor.triangle];
              if (current === undefined) {
                triangleFlips[neighbor.triangle] = expected;
                pending.push(neighbor.triangle);
              } else if (current !== expected) {
                inconsistentComponents.add(component);
              }
            }
          }
          components.push(members);
        }

        const openComponents = new Set(inconsistentComponents);
        for (const references of edges.values()) {
          if (references.length === 2) continue;
          for (const reference of references) {
            openComponents.add(componentByTriangle[reference.triangle]);
          }
        }

        const componentVolumes = new Float64Array(components.length);
        for (let component = 0; component < components.length; component += 1) {
          const members = components[component];
          const firstTriangle = triangles[members[0]];
          const firstPosition = parts[firstTriangle.part].position;
          const anchorIndex = firstTriangle.indices[0];
          const anchorX = firstPosition.getX(anchorIndex);
          const anchorY = firstPosition.getY(anchorIndex);
          const anchorZ = firstPosition.getZ(anchorIndex);
          let volume = 0;
          for (const triangleIndex of members) {
            const triangle = triangles[triangleIndex];
            const position = parts[triangle.part].position;
            const [first, sourceSecond, sourceThird] = triangle.indices;
            const second = triangleFlips[triangleIndex]
              ? sourceThird
              : sourceSecond;
            const third = triangleFlips[triangleIndex]
              ? sourceSecond
              : sourceThird;
            const ax = position.getX(first) - anchorX;
            const ay = position.getY(first) - anchorY;
            const az = position.getZ(first) - anchorZ;
            const bx = position.getX(second) - anchorX;
            const by = position.getY(second) - anchorY;
            const bz = position.getZ(second) - anchorZ;
            const cx = position.getX(third) - anchorX;
            const cy = position.getY(third) - anchorY;
            const cz = position.getZ(third) - anchorZ;
            volume +=
              (ax * (by * cz - bz * cy) +
                ay * (bz * cx - bx * cz) +
                az * (bx * cy - by * cx)) /
              6;
          }
          componentVolumes[component] = volume;
          if (Math.abs(volume) <= 1e-6) openComponents.add(component);
        }

        for (
          let triangleIndex = 0;
          triangleIndex < triangles.length;
          triangleIndex += 1
        ) {
          const triangle = triangles[triangleIndex];
          const component = componentByTriangle[triangleIndex];
          const flip =
            (triangleFlips[triangleIndex] as boolean) !==
            componentVolumes[component] < 0;
          if (!flip) continue;
          const index = parts[triangle.part].index;
          const second = index.getX(triangle.offset + 1);
          index.setX(triangle.offset + 1, index.getX(triangle.offset + 2));
          index.setX(triangle.offset + 2, second);
        }

        const isClosed = openComponents.size === 0;
        for (const { geometry, index, materials } of parts) {
          index.needsUpdate = true;
          geometry.computeVertexNormals();
          for (const material of materials) {
            if (!isSeparatedBuildingSurface(material)) continue;
            runtimeState.separatedSurfaceRenderSides.set(
              material,
              isClosed ? THREE.FrontSide : THREE.DoubleSide
            );
          }
          runtimeState.normalizedSeparatedSurfaceGeometries.add(geometry);
        }
      });
    };
  return {
    isSeparatedBuildingSurface,
    isRenderedBuildingSurface,
    resolveRenderSide,
    asMaterialArray,
    normalizeSeparatedBuildingSurfaces,
  };
}
