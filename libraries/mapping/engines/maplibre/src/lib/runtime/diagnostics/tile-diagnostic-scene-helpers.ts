import * as THREE from "three";
import type { TilesRenderer } from "3d-tiles-renderer";
import type { Tile } from "3d-tiles-renderer/core";
import { DebugTilesPlugin } from "3d-tiles-renderer/plugins";
import {
  FILL,
  type Kind,
  type OverlayRect,
} from "../../core/diagnostics/tile-diagnostic-model";
import { createTileDiagnosticExtents } from "./tile-diagnostic-extents";
import { tileWorldBox } from "./tile-diagnostic-state";
import type { TileDiagnosticOverlayInput } from "./tile-diagnostic-overlay";
const fillColor = (kind: Kind): THREE.Color => {
  const match = /rgba\((\d+), (\d+), (\d+)/.exec(FILL[kind]);
  return match
    ? new THREE.Color(
        Number(match[1]) / 255,
        Number(match[2]) / 255,
        Number(match[3]) / 255
      )
    : new THREE.Color(0x808080);
};

export const HOVER = {
  tile: "#fff05a",
  parent: "#ff974f",
  sibling: "#ff974f",
} as const;

export type TileDiagnosticSceneOptions = {
  showTileGeometry: boolean;
  wireframeColor?: string;
  sceneExtents: "none" | "boxes" | "edges";
  debugColorMode: string;
  debugBoxBounds: boolean;
  debugSphereBounds: boolean;
  debugParentBounds: boolean;
  debugUnlit: boolean;
};
/** Optional scene diagnostics, independent of React, MapLibre and story windows. */
export const createTileDiagnosticScene = (
  scene: THREE.Scene,
  readOptions: () => TileDiagnosticSceneOptions,
  requestRender: () => void
) => {
  const hoverHelpers = new THREE.Group();
  hoverHelpers.name = "mesh-coverage-hover-extents";
  scene.add(hoverHelpers);
  // Tile extents in the scene: one instanced unit cube per tile (scaled to
  // its box, coloured like the overview) or the twelve edges of each box.
  const sceneExtents = createTileDiagnosticExtents();
  scene.add(sceneExtents.group);
  const geometryGroup = new THREE.Group();
  geometryGroup.name = "mesh-coverage-loaded-wireframes";
  scene.add(geometryGroup);
  const wireMaterial = new THREE.MeshBasicMaterial({
    color: "#ffe985",
    wireframe: true,
    transparent: true,
    opacity: 0.65,
    depthWrite: false,
  });
  const wireframes = new Map<
    THREE.Mesh,
    { proxy: THREE.Mesh; onDispose: () => void }
  >();
  const syncLoadedGeometry = (group: THREE.Object3D) => {
    const seen = new Set<THREE.Mesh>();
    let changed = geometryGroup.visible !== readOptions().showTileGeometry;
    const wireColor = new THREE.Color(
      readOptions().wireframeColor ?? "#ffe985"
    );
    if (!wireMaterial.color.equals(wireColor)) {
      wireMaterial.color.copy(wireColor);
      changed = true;
    }
    geometryGroup.visible = readOptions().showTileGeometry;
    if (geometryGroup.visible)
      group.traverseVisible((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh || !mesh.geometry) return;
        seen.add(mesh);
        let entry = wireframes.get(mesh);
        if (!entry) {
          const proxy = (mesh as THREE.InstancedMesh).isInstancedMesh
            ? new THREE.InstancedMesh(
                mesh.geometry,
                wireMaterial,
                (mesh as THREE.InstancedMesh).count
              )
            : new THREE.Mesh(mesh.geometry, wireMaterial);
          proxy.matrixAutoUpdate = false;
          const onDispose = () => {
            geometryGroup.remove(proxy);
            wireframes.delete(mesh);
            mesh.geometry.removeEventListener("dispose", onDispose);
            requestRender();
          };
          mesh.geometry.addEventListener("dispose", onDispose);
          entry = { proxy, onDispose };
          wireframes.set(mesh, entry);
          geometryGroup.add(proxy);
          changed = true;
        }
        if (!entry.proxy.matrix.equals(mesh.matrixWorld)) {
          entry.proxy.matrix.copy(mesh.matrixWorld);
          entry.proxy.matrixWorldNeedsUpdate = true;
          changed = true;
        }
        if ((mesh as THREE.InstancedMesh).isInstancedMesh) {
          (entry.proxy as THREE.InstancedMesh).instanceMatrix = (
            mesh as THREE.InstancedMesh
          ).instanceMatrix;
          (entry.proxy as THREE.InstancedMesh).count = (
            mesh as THREE.InstancedMesh
          ).count;
        }
      });
    for (const [mesh, entry] of wireframes)
      if (!seen.has(mesh)) {
        mesh.geometry.removeEventListener("dispose", entry.onDispose);
        geometryGroup.remove(entry.proxy);
        wireframes.delete(mesh);
        changed = true;
      }
    // Idle updates need one render even when the settled map is not moving.
    if (changed) requestRender();
  };
  const syncSceneExtents = (rects: OverlayRect[]) => {
    const mode = readOptions().sceneExtents;
    const shown = rects.filter((rect) => rect.kind !== "ancestor");
    sceneExtents.update(
      mode,
      shown.map((rect) => rect.world),
      (index) => fillColor(shown[index].kind as Kind)
    );
  };
  // The renderer's own debug plugin, registered only while a debug option
  // is on: registered disabled it throws in its visibility hook (its groups
  // exist only while enabled), which aborts every tile update.
  let debugPlugin: DebugTilesPlugin | null = null;
  let debugHost: TilesRenderer | null = null;
  const syncDebugPlugin = (tiles: TilesRenderer) => {
    const {
      debugColorMode,
      debugBoxBounds,
      debugSphereBounds,
      debugParentBounds,
      debugUnlit,
    } = readOptions();
    const wanted =
      debugColorMode !== "NONE" ||
      debugBoxBounds ||
      debugSphereBounds ||
      debugParentBounds ||
      debugUnlit;
    if (!wanted) {
      if (debugPlugin && debugHost)
        debugHost.unregisterPlugin(debugPlugin as never);
      debugPlugin = null;
      debugHost = null;
      return;
    }
    if (debugHost !== tiles) {
      if (debugPlugin && debugHost)
        debugHost.unregisterPlugin(debugPlugin as never);
      debugPlugin = new DebugTilesPlugin({ enabled: true });
      tiles.registerPlugin(debugPlugin as never);
      debugHost = tiles;
    }
    if (!debugPlugin) return;
    const modes = DebugTilesPlugin.ColorModes as unknown as Record<
      string,
      number
    >;
    debugPlugin.colorMode = (modes[debugColorMode] ?? 0) as never;
    debugPlugin.displayBoxBounds = debugBoxBounds;
    debugPlugin.displaySphereBounds = debugSphereBounds;
    debugPlugin.displayParentBounds = debugParentBounds;
    debugPlugin.unlit = debugUnlit;
  };

  let helpersFor: TileDiagnosticOverlayInput["hover"] = null;
  const syncHoverHelpers = (
    group: THREE.Object3D,
    current: TileDiagnosticOverlayInput["hover"]
  ) => {
    if (current === helpersFor) return;
    helpersFor = current;
    for (const child of [...hoverHelpers.children]) {
      hoverHelpers.remove(child);
      (child as THREE.Box3Helper).dispose?.();
    }
    if (!current) return;
    const add = (tile: Tile, color: string) => {
      const worldBox = new THREE.Box3();
      if (!tileWorldBox(tile, group, worldBox)) return;
      hoverHelpers.add(new THREE.Box3Helper(worldBox, new THREE.Color(color)));
    };
    for (const sibling of current.siblings) add(sibling, HOVER.sibling);
    if (current.parent) add(current.parent, HOVER.parent);
    add(current.tile, HOVER.tile);
  };

  return {
    syncLoadedGeometry,
    syncSceneExtents,
    syncDebugPlugin,
    syncHoverHelpers,
    dispose() {
      for (const child of hoverHelpers.children)
        (child as THREE.Box3Helper).dispose();
      scene.remove(hoverHelpers);
      sceneExtents.dispose();
      for (const [mesh, entry] of wireframes)
        mesh.geometry.removeEventListener("dispose", entry.onDispose);
      wireframes.clear();
      geometryGroup.clear();
      scene.remove(geometryGroup);
      wireMaterial.dispose();
      if (debugPlugin && debugHost)
        debugHost.unregisterPlugin(debugPlugin as never);
    },
  };
};
