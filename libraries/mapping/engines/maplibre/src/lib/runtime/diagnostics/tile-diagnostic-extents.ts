import * as THREE from "three";

const EDGES = [
  0, 1, 1, 3, 3, 2, 2, 0, 4, 5, 5, 7, 7, 6, 6, 4, 0, 4, 1, 5, 2, 6, 3, 7,
];
const capacityFor = (count: number) =>
  2 ** Math.ceil(Math.log2(Math.max(1, count)));

/** Coverage diagnostics only: grow buffers on demand, reuse them across snapshots. */
export const createTileDiagnosticExtents = () => {
  const group = new THREE.Group();
  group.name = "mesh-coverage-tile-extents";
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const boxMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const edgeMaterial = new THREE.LineBasicMaterial({ vertexColors: true });
  const edgeGeometry = new THREE.BufferGeometry();
  const lines = new THREE.LineSegments(edgeGeometry, edgeMaterial);
  lines.frustumCulled = false;
  group.add(lines);
  let boxes: THREE.InstancedMesh | null = null;
  let boxCapacity = 0;
  let edgeCapacity = 0;
  const matrix = new THREE.Matrix4();
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const minimumSize = new THREE.Vector3(1, 1, 1);
  return {
    group,
    update(
      mode: "none" | "boxes" | "edges",
      bounds: readonly THREE.Box3[],
      colorAt: (index: number) => THREE.Color
    ) {
      group.visible = mode !== "none" && bounds.length > 0;
      lines.visible = mode === "edges";
      if (boxes) boxes.visible = mode === "boxes";
      if (!group.visible) return;
      if (mode === "boxes") {
        if (bounds.length > boxCapacity) {
          if (boxes) {
            group.remove(boxes);
            boxes.dispose(); // Instance buffers only, not the shared unit cube.
          }
          boxCapacity = capacityFor(bounds.length);
          boxes = new THREE.InstancedMesh(unitBox, boxMaterial, boxCapacity);
          boxes.frustumCulled = false;
          group.add(boxes);
        }
        boxes!.count = bounds.length;
        bounds.forEach((bound, index) => {
          matrix.compose(
            bound.getCenter(center),
            rotation,
            bound.getSize(size).max(minimumSize)
          );
          boxes!.setMatrixAt(index, matrix);
          boxes!.setColorAt(index, colorAt(index));
        });
        boxes!.instanceMatrix.needsUpdate = true;
        if (boxes!.instanceColor) boxes!.instanceColor.needsUpdate = true;
        return;
      }
      if (bounds.length > edgeCapacity) {
        // Release old GPU attributes before replacing them; object identity stays.
        edgeGeometry.dispose();
        edgeCapacity = capacityFor(bounds.length);
        edgeGeometry.setAttribute(
          "position",
          new THREE.BufferAttribute(new Float32Array(edgeCapacity * 72), 3)
        );
        edgeGeometry.setAttribute(
          "color",
          new THREE.BufferAttribute(new Float32Array(edgeCapacity * 72), 3)
        );
      }
      const positions = edgeGeometry.getAttribute(
        "position"
      ) as THREE.BufferAttribute;
      const colors = edgeGeometry.getAttribute(
        "color"
      ) as THREE.BufferAttribute;
      bounds.forEach(({ min, max }, index) => {
        const color = colorAt(index);
        EDGES.forEach((bits, vertex) => {
          const offset = index * 24 + vertex;
          positions.setXYZ(
            offset,
            bits & 1 ? max.x : min.x,
            bits & 2 ? max.y : min.y,
            bits & 4 ? max.z : min.z
          );
          colors.setXYZ(offset, color.r, color.g, color.b);
        });
      });
      positions.needsUpdate = true;
      colors.needsUpdate = true;
      edgeGeometry.setDrawRange(0, bounds.length * 24);
    },
    dispose() {
      boxes?.dispose();
      unitBox.dispose();
      edgeGeometry.dispose();
      boxMaterial.dispose();
      edgeMaterial.dispose();
      group.clear();
      group.removeFromParent();
    },
  };
};
