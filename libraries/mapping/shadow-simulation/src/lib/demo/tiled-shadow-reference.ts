import * as THREE from "three";
import { TextGeometry } from "three/examples/jsm/geometries/TextGeometry.js";
import { FontLoader } from "three/examples/jsm/loaders/FontLoader.js";
import helvetiker from "three/examples/fonts/helvetiker_bold.typeface.json";

import type { ShadowReceiverCell } from "../core/shadow-page-plan";
import type { ShadowPageLevel } from "../runtime/tiled-shadow-renderer";

export type ShadowDemoCaster = "lod-numbers" | "columns";

/** Metre-scale geometry only. All rendering/sampling stays in the shared runtime. */
export const createTiledShadowReference = () => {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xdceaff, 0x424047, 0.7));
  const terrain = new THREE.PlaneGeometry(192, 320, 96, 160);
  terrain.rotateX(-Math.PI / 2);
  const positions = terrain.attributes.position;
  for (let i = 0; i < positions.count; i += 1) {
    positions.setY(
      i,
      2 * Math.sin(positions.getX(i) / 14) * Math.cos(positions.getZ(i) / 19)
    );
  }
  terrain.computeVertexNormals();
  const terrainMaterial = new THREE.MeshStandardMaterial({
    color: "#bccab0",
    roughness: 1,
  });
  const ground = new THREE.Mesh(terrain, terrainMaterial);
  ground.castShadow = true;
  ground.receiveShadow = true;
  scene.add(ground);
  const box = new THREE.BoxGeometry(6, 14, 6);
  const buildingMaterial = new THREE.MeshStandardMaterial({
    color: "#dba776",
    roughness: 0.9,
    // All walls/roofs participate in depth, including thin/open surfaces.
    // Three otherwise reverses FrontSide to BackSide for the shadow pass.
    shadowSide: THREE.DoubleSide,
  });
  const cells: ShadowReceiverCell[] = [];
  const objects = new Map<
    string,
    THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>
  >();
  const levels = new Map<string, number>();
  const font = new FontLoader().parse(helvetiker);
  const digits = new Map<number, THREE.BufferGeometry>();
  const numberGeometry = (level: number) => {
    let geometry = digits.get(level);
    if (!geometry) {
      geometry = new TextGeometry(String(level), {
        font,
        size: 13,
        depth: 14,
        curveSegments: 6,
        bevelEnabled: false,
      });
      geometry.rotateX(-Math.PI / 2);
      geometry.computeBoundingBox();
      const center = geometry.boundingBox!.getCenter(new THREE.Vector3());
      geometry.translate(-center.x, 0, -center.z);
      digits.set(level, geometry);
    }
    return geometry;
  };
  let caster: ShadowDemoCaster = "lod-numbers";
  let lift = 0;
  for (let x = -3; x < 3; x += 1) {
    for (let z = -5; z < 5; z += 1) {
      cells.push({
        id: `${x}/${z}`,
        bounds: new THREE.Box3(
          new THREE.Vector3(x * 32, -3, z * 32),
          new THREE.Vector3((x + 1) * 32, 17, (z + 1) * 32)
        ),
      });
      const building = new THREE.Mesh(numberGeometry(0), buildingMaterial);
      // Embed the foundation below the lowest fixture terrain (-2 m), so
      // geometric floating gaps cannot be confused with shadow-cache gaps.
      building.position.set(x * 32 + 16, -3, z * 32 + 16);
      building.castShadow = true;
      building.receiveShadow = true;
      scene.add(building);
      objects.set(`${x}/${z}`, building);
      levels.set(`${x}/${z}`, 0);
    }
  }
  scene.updateMatrixWorld(true);
  return {
    scene,
    cells,
    setCaster(
      next: ShadowDemoCaster,
      liftMeters: number
    ): readonly THREE.Box3[] {
      if (next === caster && lift === liftMeters) return [];
      const previousLift = lift;
      caster = next;
      lift = liftMeters;
      for (const cell of cells) cell.bounds.max.y = 17 + lift;
      for (const [id, object] of objects) {
        object.geometry =
          caster === "columns" ? box : numberGeometry(levels.get(id) ?? 0);
        object.position.y = (caster === "columns" ? 4 : -3) + lift;
      }
      scene.updateMatrixWorld(true);
      return cells.map(({ bounds }) =>
        bounds
          .clone()
          .expandByVector(
            new THREE.Vector3(0, Math.abs(previousLift - lift), 0)
          )
      );
    },
    setLevels(pages: readonly ShadowPageLevel[]): readonly THREE.Box3[] {
      const changed: THREE.Box3[] = [];
      for (const page of pages) {
        if (levels.get(page.id) === page.level) continue;
        levels.set(page.id, page.level);
        if (caster === "columns") continue;
        const object = objects.get(page.id);
        if (!object) continue;
        const oldBounds = new THREE.Box3().setFromObject(object);
        object.geometry = numberGeometry(page.level);
        changed.push(oldBounds.union(new THREE.Box3().setFromObject(object)));
      }
      return changed;
    },
    dispose() {
      terrain.dispose();
      box.dispose();
      for (const geometry of digits.values()) geometry.dispose();
      terrainMaterial.dispose();
      buildingMaterial.dispose();
      scene.clear();
    },
  };
};
