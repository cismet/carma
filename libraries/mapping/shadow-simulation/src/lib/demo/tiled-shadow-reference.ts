import * as THREE from "three";

import type { ShadowReceiverCell } from "../core/shadow-page-plan";

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
  const columns: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>[] =
    [];
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
      const column = new THREE.Mesh(box, buildingMaterial);
      // Embed the foundation below the lowest fixture terrain (-2 m), so
      // geometric floating gaps cannot be confused with shadow-cache gaps.
      column.position.set(x * 32 + 16, 4, z * 32 + 16);
      column.castShadow = true;
      column.receiveShadow = true;
      scene.add(column);
      columns.push(column);
    }
  }
  scene.updateMatrixWorld(true);
  return {
    scene,
    cells,
    setCasterLift(liftMeters: number): readonly THREE.Box3[] {
      if (lift === liftMeters) return [];
      const previousLift = lift;
      lift = liftMeters;
      for (const cell of cells) cell.bounds.max.y = 17 + lift;
      for (const column of columns) column.position.y = 4 + lift;
      scene.updateMatrixWorld(true);
      return cells.map(({ bounds }) =>
        bounds
          .clone()
          .expandByVector(
            new THREE.Vector3(0, Math.abs(previousLift - lift), 0)
          )
      );
    },
    dispose() {
      terrain.dispose();
      box.dispose();
      terrainMaterial.dispose();
      buildingMaterial.dispose();
      scene.clear();
    },
  };
};
