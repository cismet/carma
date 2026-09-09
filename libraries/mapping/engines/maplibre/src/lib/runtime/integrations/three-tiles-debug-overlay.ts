import * as THREE from "three";

import type { SharedThreeSceneTileVolume } from "./shared-three-scene-layer";

export type ThreeTilesDebugVolume = Readonly<{
  id: string;
  bounds: THREE.Box3;
  boundsTransform?: THREE.Matrix4;
  loadReason?: SharedThreeSceneTileVolume["loadReason"];
  details?: readonly string[];
  corridor?: Readonly<{
    direction: THREE.Vector3;
    distance: number;
  }>;
}>;

export const THREE_TILES_DEBUG_COLORS = {
  viewport: "#0284c7",
  shadow: "#ea580c",
  other: "#64748b",
} as const;

export const getThreeTilesDebugColor = (
  loadReason: ThreeTilesDebugVolume["loadReason"]
): string => THREE_TILES_DEBUG_COLORS[loadReason ?? "other"];

const disposeObject = (object: THREE.Object3D) => {
  object.traverse((child) => {
    const renderable = child as THREE.Object3D & {
      geometry?: THREE.BufferGeometry;
      material?: THREE.Material | THREE.Material[];
    };
    renderable.geometry?.dispose();
    const materials = Array.isArray(renderable.material)
      ? renderable.material
      : renderable.material
      ? [renderable.material]
      : [];
    for (const material of materials) {
      const texture = (material as THREE.SpriteMaterial).map;
      texture?.dispose();
      material.dispose();
    }
  });
};

const clearGroup = (group: THREE.Group) => {
  for (const child of [...group.children]) {
    group.remove(child);
    disposeObject(child);
  }
};

const shortLabel = (id: string) => {
  const decoded = (() => {
    try {
      return decodeURIComponent(id);
    } catch {
      return id;
    }
  })();
  return decoded.length <= 48
    ? decoded
    : `${decoded.slice(0, 20)}…${decoded.slice(-27)}`;
};

const BOX_EDGE_INDICES = [
  [0, 1],
  [0, 2],
  [0, 4],
  [1, 3],
  [1, 5],
  [2, 3],
  [2, 6],
  [3, 7],
  [4, 5],
  [4, 6],
  [5, 7],
  [6, 7],
] as const;

const boxCorners = (
  bounds: THREE.Box3,
  transform = new THREE.Matrix4()
) => {
  const { min, max } = bounds;
  return [
    new THREE.Vector3(min.x, min.y, min.z),
    new THREE.Vector3(max.x, min.y, min.z),
    new THREE.Vector3(min.x, max.y, min.z),
    new THREE.Vector3(max.x, max.y, min.z),
    new THREE.Vector3(min.x, min.y, max.z),
    new THREE.Vector3(max.x, min.y, max.z),
    new THREE.Vector3(min.x, max.y, max.z),
    new THREE.Vector3(max.x, max.y, max.z),
  ].map((corner) => corner.applyMatrix4(transform));
};

const createLineSegments = (
  positions: readonly THREE.Vector3[],
  color: string,
  opacity: number,
  name: string
) => {
  const geometry = new THREE.BufferGeometry().setFromPoints(positions);
  const material = new THREE.LineBasicMaterial({
    color,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    opacity,
    toneMapped: false,
  });
  const lines = new THREE.LineSegments(geometry, material);
  lines.name = name;
  lines.renderOrder = 10_000;
  lines.frustumCulled = false;
  return lines;
};

const createBoundsEdges = (
  volume: ThreeTilesDebugVolume,
  color: string
) => {
  const corners = boxCorners(volume.bounds, volume.boundsTransform);
  return createLineSegments(
    BOX_EDGE_INDICES.flatMap(([start, end]) => [corners[start], corners[end]]),
    color,
    0.9,
    `${volume.loadReason ?? "other"}: ${volume.id}`
  );
};

const createCorridorEdges = (
  volume: ThreeTilesDebugVolume,
  color: string
) => {
  if (!volume.corridor || volume.corridor.distance <= 0) return null;
  const near = boxCorners(volume.bounds, volume.boundsTransform);
  const offset = volume.corridor.direction
    .clone()
    .normalize()
    .multiplyScalar(volume.corridor.distance);
  const far = near.map((corner) => corner.clone().add(offset));
  const positions = [
    ...BOX_EDGE_INDICES.flatMap(([start, end]) => [far[start], far[end]]),
    ...near.flatMap((corner, index) => [corner, far[index]]),
  ];
  return createLineSegments(
    positions,
    color,
    0.55,
    `sunward corridor: ${volume.id}`
  );
};

const createLabel = (
  volume: ThreeTilesDebugVolume,
  color: string
): THREE.Sprite | null => {
  if (typeof document === "undefined") return null;
  const lines = [shortLabel(volume.id), ...(volume.details ?? [])];
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return null;
  const fontSize = 24;
  context.font = `600 ${fontSize}px ui-monospace, monospace`;
  const textWidth = Math.ceil(
    Math.max(...lines.map((line) => context.measureText(line).width))
  );
  canvas.width = Math.max(64, textWidth + 20);
  canvas.height = 10 + lines.length * 30;
  context.font = `600 ${fontSize}px ui-monospace, monospace`;
  context.fillStyle = "rgba(255,255,255,0.9)";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = color;
  context.lineWidth = 3;
  context.strokeRect(1.5, 1.5, canvas.width - 3, canvas.height - 3);
  context.fillStyle = color;
  context.textBaseline = "middle";
  lines.forEach((line, index) => {
    context.fillText(line, 10, 20 + index * 30);
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const sprite = new THREE.Sprite(material);
  const size = volume.bounds.getSize(new THREE.Vector3());
  const labelHeight = THREE.MathUtils.clamp(
    Math.max(size.x, size.y, size.z) * 0.06,
    1.5,
    12
  );
  sprite.scale.set(
    labelHeight * (canvas.width / canvas.height),
    labelHeight,
    1
  );
  sprite.position
    .copy(volume.bounds.getCenter(new THREE.Vector3()))
    .applyMatrix4(volume.boundsTransform ?? new THREE.Matrix4());
  const transformedBounds = new THREE.Box3().setFromPoints(
    boxCorners(volume.bounds, volume.boundsTransform)
  );
  sprite.position.y = transformedBounds.max.y;
  sprite.center.set(0.5, 0);
  sprite.renderOrder = 10_001;
  sprite.frustumCulled = false;
  return sprite;
};

export const createThreeTilesDebugOverlay = (parent: THREE.Object3D) => {
  const root = new THREE.Group();
  root.name = "CARMA 3D tiles bounds and labels";
  root.renderOrder = 10_000;
  parent.add(root);
  let signature = "";

  const update = (volumes: readonly ThreeTilesDebugVolume[]) => {
    const nextSignature = volumes
      .map(({ id, bounds, boundsTransform, loadReason, details, corridor }) =>
        [
          id,
          loadReason ?? "other",
          ...(details ?? []),
          ...bounds.min.toArray().map((value) => value.toFixed(3)),
          ...bounds.max.toArray().map((value) => value.toFixed(3)),
          ...(boundsTransform?.elements ?? []).map((value) => value.toFixed(3)),
          ...(corridor
            ? [
                ...corridor.direction
                  .toArray()
                  .map((value) => value.toFixed(3)),
                corridor.distance.toFixed(2),
              ]
            : []),
        ].join(":")
      )
      .join("|");
    if (nextSignature === signature) return;
    signature = nextSignature;
    clearGroup(root);

    for (const volume of volumes) {
      const color = getThreeTilesDebugColor(volume.loadReason);
      const helper = createBoundsEdges(volume, color);
      root.add(helper);
      const corridor = createCorridorEdges(volume, color);
      if (corridor) root.add(corridor);
      const label = createLabel(volume, color);
      if (label) root.add(label);
    }
  };

  return {
    root,
    update,
    dispose() {
      clearGroup(root);
      root.removeFromParent();
    },
  };
};
