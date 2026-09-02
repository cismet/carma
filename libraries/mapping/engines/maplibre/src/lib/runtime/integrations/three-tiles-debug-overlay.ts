import * as THREE from "three";

import type { SharedThreeSceneTileVolume } from "./shared-three-scene-layer";

export type ThreeTilesDebugVolume = Readonly<{
  id: string;
  bounds: THREE.Box3;
  loadReason?: SharedThreeSceneTileVolume["loadReason"];
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

const createLabel = (
  volume: ThreeTilesDebugVolume,
  color: string
): THREE.Sprite | null => {
  if (typeof document === "undefined") return null;
  const text = shortLabel(volume.id);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return null;
  const fontSize = 24;
  context.font = `600 ${fontSize}px ui-monospace, monospace`;
  const textWidth = Math.ceil(context.measureText(text).width);
  canvas.width = Math.max(64, textWidth + 20);
  canvas.height = 38;
  context.font = `600 ${fontSize}px ui-monospace, monospace`;
  context.fillStyle = "rgba(255,255,255,0.9)";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = color;
  context.lineWidth = 3;
  context.strokeRect(1.5, 1.5, canvas.width - 3, canvas.height - 3);
  context.fillStyle = color;
  context.textBaseline = "middle";
  context.fillText(text, 10, canvas.height / 2 + 1);

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
  sprite.position.copy(volume.bounds.getCenter(new THREE.Vector3()));
  sprite.position.y = volume.bounds.max.y;
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
      .map(({ id, bounds, loadReason }) =>
        [
          id,
          loadReason ?? "other",
          ...bounds.min.toArray().map((value) => value.toFixed(3)),
          ...bounds.max.toArray().map((value) => value.toFixed(3)),
        ].join(":")
      )
      .join("|");
    if (nextSignature === signature) return;
    signature = nextSignature;
    clearGroup(root);

    for (const volume of volumes) {
      const color = getThreeTilesDebugColor(volume.loadReason);
      const helper = new THREE.Box3Helper(volume.bounds, color);
      const helperMaterial = helper.material as THREE.LineBasicMaterial;
      helper.name = `${volume.loadReason ?? "other"}: ${volume.id}`;
      helperMaterial.depthTest = false;
      helperMaterial.depthWrite = false;
      helperMaterial.transparent = true;
      helperMaterial.opacity = 0.9;
      helperMaterial.toneMapped = false;
      helper.renderOrder = 10_000;
      helper.frustumCulled = false;
      root.add(helper);
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
