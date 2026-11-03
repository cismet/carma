import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import type { SharedThreeSceneFrame } from "../../core/shared-three-scene-types";
import type { ThreeTilesRuntimeState } from "./three-tiles-runtime-context";
import { createThreeTilesPicking } from "./three-tiles-runtime-picking";
import { TILE_HIGHLIGHT_FLAG } from "./three-tiles-runtime-vendor";

const VIEWPORT = 100;

/**
 * One tile mesh in the y = 0 plane holding two buildings side by side: x < 0
 * is building A (feature 0), x > 0 is building B (feature 1). Two triangles
 * each, ids carried per vertex the way GLTFLoader hands `_FEATURE_ID_0` over.
 */
const buildTileMesh = () => {
  const positions = [
    // A
    -10, 0, -5, -10, 0, 5, -1, 0, 5, -10, 0, -5, -1, 0, 5, -1, 0, -5,
    // B
    1, 0, -5, 1, 0, 5, 10, 0, 5, 1, 0, -5, 10, 0, 5, 10, 0, -5,
  ];
  const featureIds = [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setAttribute(
    "_feature_id_0",
    new THREE.Float32BufferAttribute(featureIds, 1)
  );
  geometry.setIndex([...Array(12).keys()]);
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
  );
  const rows = [
    { building_id: "A", geb_fkt: "Rathaus" },
    { building_id: "B", geb_fkt: "Wohnhaus" },
  ];
  mesh.userData.meshFeatures = {
    getFeatures: (triangle: number) => [featureIds[triangle * 3]],
    getFeatureInfo: () => [{ propertyTable: 0, attribute: 0 }],
  };
  mesh.userData.structuralMetadata = {
    getPropertyTableData: (_table: number, id: number) => ({ ...rows[id] }),
  };
  return mesh;
};

/** A camera 50 m above the origin looking straight down, north up. */
const buildCamera = () => {
  const camera = new THREE.PerspectiveCamera(60, 1, 1, 1000);
  camera.position.set(0, 50, 0);
  camera.up.set(0, 0, -1);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  return camera;
};

const setup = () => {
  const orientationGroup = new THREE.Group();
  const mount = new THREE.Group();
  // The mount sits off the origin, so a highlight written in world
  // coordinates instead of the mount's own would land in the wrong place.
  mount.position.set(3, 0, 0);
  const group = new THREE.Group();
  orientationGroup.add(mount);
  mount.add(group);
  const tile = buildTileMesh();
  tile.position.set(-3, 0, 0);
  group.add(tile);
  orientationGroup.updateMatrixWorld(true);

  const map = {
    getCanvas: () => ({ clientWidth: VIEWPORT, clientHeight: VIEWPORT }),
    triggerRepaint: vi.fn(),
  };
  // The renderer announces tile changes as events, which the overlay follows.
  const tiles = Object.assign(
    new THREE.EventDispatcher<{
      "load-model": object;
      "dispose-model": object;
      "tile-visibility-change": object;
    }>(),
    { group }
  );
  const state = {
    tiles,
    map,
    runtimeVisible: true,
    orientationGroup,
  } as unknown as ThreeTilesRuntimeState;
  const picking = createThreeTilesPicking(state);
  const observerFrame = {
    renderCamera: buildCamera(),
    cssViewport: new THREE.Vector2(VIEWPORT, VIEWPORT),
  } as unknown as SharedThreeSceneFrame;
  return { picking, observerFrame, mount, group, tile, tiles };
};

const overlayOf = (mount: THREE.Object3D) =>
  mount.children.find(
    (child) => child.userData[TILE_HIGHLIGHT_FLAG] === true
  ) as THREE.Mesh | undefined;

describe("three-tiles runtime picking", () => {
  it("answers nothing before an observer frame has shown the tileset", () => {
    const { picking } = setup();
    expect(picking.raycast(35, 50)).toBeNull();
  });

  it("ignores cameras of offscreen frames", () => {
    const { picking, observerFrame } = setup();
    picking.observeFrame({
      ...observerFrame,
      cssViewport: undefined,
    });
    expect(picking.raycast(35, 50)).toBeNull();
  });

  it("resolves the clicked building out of the property table", () => {
    const { picking, observerFrame } = setup();
    picking.observeFrame(observerFrame);

    const left = picking.raycast(35, 50);
    expect(left?.kind).toBe("tiles3d");
    expect(left?.properties).toEqual({ building_id: "A", geb_fkt: "Rathaus" });
    expect(left?.features).toEqual([
      {
        featureId: 0,
        propertyTable: 0,
        properties: { building_id: "A", geb_fkt: "Rathaus" },
      },
    ]);

    const right = picking.raycast(65, 50);
    expect(right?.properties?.building_id).toBe("B");
    expect(right?.resolvedSourceIndex).not.toBe(left?.resolvedSourceIndex);
    expect(picking.raycast(35, 50)?.resolvedSourceIndex).toBe(
      left?.resolvedSourceIndex
    );
  });

  it("copies only the picked building's triangles beside the tiles", () => {
    const { picking, observerFrame, mount } = setup();
    picking.observeFrame(observerFrame);
    const hit = picking.raycast(65, 50);
    picking.highlight(hit?.resolvedSourceIndex ?? -1);

    const overlay = mount.children.find(
      (child) => child.userData[TILE_HIGHLIGHT_FLAG] === true
    ) as THREE.Mesh | undefined;
    expect(overlay).toBeDefined();
    const position = (overlay?.geometry as THREE.BufferGeometry).getAttribute(
      "position"
    );
    expect(position.count).toBe(6);
    const xs = Array.from({ length: position.count }, (_, i) =>
      position.getX(i)
    );
    // Building B spans x 1..10 in the tile, which sits at -3 in the mount.
    expect(Math.min(...xs)).toBeCloseTo(-2);
    expect(Math.max(...xs)).toBeCloseTo(7);
    expect(overlay?.castShadow).toBe(false);

    picking.unhighlight();
    expect(
      mount.children.some((child) => child.userData[TILE_HIGHLIGHT_FLAG])
    ).toBe(false);
  });

  it("copies the building again when the tiles change under the highlight", () => {
    const { picking, observerFrame, mount, group, tile, tiles } = setup();
    picking.observeFrame(observerFrame);
    picking.highlight(picking.raycast(65, 50)?.resolvedSourceIndex ?? -1);

    // A second tile with more of building B comes in after the click.
    const more = buildTileMesh();
    more.position.set(-3, 0, 20);
    group.add(more);
    group.updateMatrixWorld(true);
    tiles.dispatchEvent({ type: "load-model" });
    picking.observeFrame(observerFrame);
    expect(
      (overlayOf(mount)?.geometry as THREE.BufferGeometry).getAttribute(
        "position"
      ).count
    ).toBe(12);

    // The first one is swapped out; its triangles leave the overlay with it.
    tile.visible = false;
    tiles.dispatchEvent({ type: "tile-visibility-change" });
    picking.observeFrame(observerFrame);
    expect(
      (overlayOf(mount)?.geometry as THREE.BufferGeometry).getAttribute(
        "position"
      ).count
    ).toBe(6);

    // Without a highlight, tile changes leave the scene alone.
    picking.unhighlight();
    tiles.dispatchEvent({ type: "load-model" });
    picking.observeFrame(observerFrame);
    expect(overlayOf(mount)).toBeUndefined();
  });

  it("does not pick a building behind a surface without features", () => {
    const { picking, observerFrame, group } = setup();
    const cover = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
    );
    cover.position.set(0, 10, 0);
    group.add(cover);
    group.updateMatrixWorld(true);
    picking.observeFrame(observerFrame);

    expect(picking.raycast(35, 50)).toBeNull();
  });

  it("skips tiles the renderer has hidden", () => {
    const { picking, observerFrame, tile } = setup();
    tile.visible = false;
    picking.observeFrame(observerFrame);

    expect(picking.raycast(35, 50)).toBeNull();
  });
});
