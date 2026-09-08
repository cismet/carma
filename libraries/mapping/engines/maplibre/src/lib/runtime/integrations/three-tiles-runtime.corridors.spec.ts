// @vitest-environment jsdom
import { TilesRenderer } from "3d-tiles-renderer";
import type { Tile } from "3d-tiles-renderer/core";
import type { Map as MaplibreMap } from "maplibre-gl";
import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { buildThreeTilesRuntime } from "./three-tiles-runtime";

vi.hoisted(() => {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: () => "blob:vitest-maplibre-worker",
  });
});

describe("native mesh corridor publication", () => {
  it.each([
    { cityRootFallback: false, presentation: "off" },
    { cityRootFallback: true, presentation: "off" },
    { cityRootFallback: true, presentation: "ack" },
    { cityRootFallback: true, presentation: "disabled" },
  ])(
    "publishes city fallback=$cityRootFallback with presentation=$presentation, then swaps both together",
    ({ cityRootFallback, presentation }) => {
      let renderer: TilesRenderer;
      let proposed = new Set<Tile>();
      const update = vi
        .spyOn(TilesRenderer.prototype, "update")
        .mockImplementation(function () {
          renderer = this;
          this.frameCount += 1;
          this.visibleTiles.clear();
          for (const tile of proposed) this.visibleTiles.add(tile);
        });
      const nativeError = vi
        .spyOn(TilesRenderer.prototype, "calculateTileViewErrorWithPlugin")
        .mockImplementation((_tile, target) => {
          target.inView = false;
          target.error = Number.POSITIVE_INFINITY;
        });
      const map = {
        on: vi.fn(),
        off: vi.fn(),
        triggerRepaint: vi.fn(),
        isMoving: () => false,
      } as unknown as MaplibreMap;
      const runtime = buildThreeTilesRuntime(
        "corridor",
        "https://example.test/mesh/tileset.json",
        [7.2, 51.2],
        { providesTerrain: true }
      );
      const camera = new THREE.PerspectiveCamera();
      const frame = {
        map,
        renderCamera: camera,
        lodCamera: camera,
        viewport: new THREE.Vector2(800, 600),
        lookTarget: new THREE.Vector3(),
      };
      runtime.onAdd?.(map);
      runtime.setErrorTarget(1);
      runtime.setShadowStagePresentationGate?.(presentation !== "off");
      runtime.update(frame);
      if (cityRootFallback) {
        // ECEF-to-local placement rotates native boxes relative to sunlight.
        renderer!.group.rotation.z = Math.PI / 4;
        renderer!.group.updateMatrixWorld(true);
      }
      const bounds = new THREE.Box3(
        new THREE.Vector3(-10, -10, -110),
        new THREE.Vector3(10, 10, -90)
      );
      const sun = new THREE.OrthographicCamera(-100, 100, 100, -100, 1, 500);
      sun.position.set(0, 0, 100);
      sun.lookAt(0, 0, 0);
      sun.updateMatrixWorld(true);
      const sunward = new THREE.Vector3(0, 0, 1)
        .transformDirection(renderer!.group.matrixWorld.clone().invert())
        .multiplyScalar(50);
      const makeTile = (
        id: string,
        box: THREE.Box3,
        inView: boolean,
        error: number,
        parent: Tile | null = null
      ): Tile =>
        ({
          content: { uri: `${id}.b3dm` },
          geometricError: error,
          parent,
          children: [],
          refine: "REPLACE",
          internal: {
            hasContent: true,
            hasRenderableContent: true,
            loadingState: 4,
            basePath: "https://example.test/mesh",
            depth: parent ? 1 : 0,
          },
          traversal: { error, inFrustum: inView },
          engineData: {
            scene: new THREE.Group(),
            boundingVolume: {
              getAABB: (target: THREE.Box3) => target.copy(box),
              getSphere: (target: THREE.Sphere) =>
                box.getBoundingSphere(target),
              intersectsFrustum: () => inView,
            },
          },
        } as unknown as Tile);
      const root = makeTile(
        "root",
        new THREE.Box3(
          new THREE.Vector3(-200, -200, -200),
          new THREE.Vector3(200, 200, 200)
        ),
        true,
        64
      );
      root.internal.hasContent = cityRootFallback;
      root.internal.hasRenderableContent = cityRootFallback;
      const coarseReceiver = makeTile("receiver16", bounds, true, 16, root);
      const coarseCaster = makeTile(
        "caster16",
        bounds.clone().translate(sunward),
        true,
        16,
        root
      );
      // A nearby caster can have a much larger native camera SSE than the
      // distant surface receiving its shadow. It is not a receiver candidate.
      coarseCaster.traversal.error = 128;
      const fineBounds = cityRootFallback
        ? new THREE.Box3(
            new THREE.Vector3(-1, -1, -101),
            new THREE.Vector3(1, 1, -99)
          )
        : bounds;
      const fineReceiver = makeTile(
        "receiver1",
        fineBounds,
        true,
        1,
        coarseReceiver
      );
      const fineCaster = makeTile(
        "caster1",
        fineBounds.clone().translate(sunward),
        false,
        1,
        coarseCaster
      );
      root.children = [coarseReceiver, coarseCaster];
      coarseReceiver.children = [fineReceiver];
      coarseCaster.children = [fineCaster];
      fineCaster.internal.loadingState = 2;
      Object.assign(renderer!, { rootTileset: { root } });
      const unrelated = makeTile(
        "unrelated-pending",
        bounds
          .clone()
          .translate(
            new THREE.Vector3(1, 0, 0)
              .transformDirection(renderer!.group.matrixWorld.clone().invert())
              .multiplyScalar(100)
          ),
        true,
        8,
        root
      );
      unrelated.internal.loadingState = 2;
      const fringe = makeTile(
        "coarse-fringe",
        fineBounds
          .clone()
          .translate(
            sunward
              .clone()
              .add(
                new THREE.Vector3(1, 0, 0)
                  .transformDirection(
                    renderer!.group.matrixWorld.clone().invert()
                  )
                  .multiplyScalar(8)
              )
          ),
        false,
        16,
        root
      );
      if (cityRootFallback) root.children.push(unrelated);
      else renderer!.group.add(new THREE.Group());
      if (cityRootFallback) root.children.push(fringe);
      if (cityRootFallback) {
        const nativeToLight = sun.matrixWorldInverse
          .clone()
          .multiply(renderer!.group.matrixWorld);
        const receiverLight = bounds.clone().applyMatrix4(nativeToLight);
        const receiverCenter = receiverLight.getCenter(new THREE.Vector3());
        const localBox = new THREE.Box3(
          new THREE.Vector3(-0.1, -50, -1),
          new THREE.Vector3(0.1, 50, 1)
        );
        const lightPlacement = new THREE.Matrix4().makeTranslation(
          receiverLight.max.x + 2,
          receiverCenter.y,
          receiverLight.max.z + 50
        );
        const transform = nativeToLight
          .clone()
          .invert()
          .multiply(lightPlacement);
        const nativeAabb = localBox.clone().applyMatrix4(transform);
        const inflatedLight = nativeAabb.clone().applyMatrix4(nativeToLight);
        const actualLight = localBox.clone().applyMatrix4(lightPlacement);
        expect(inflatedLight.min.x).toBeLessThan(receiverLight.max.x);
        expect(actualLight.min.x).toBeGreaterThan(receiverLight.max.x);
        const phantom = makeTile(
          "pending-outside-oriented-corridor",
          nativeAabb,
          false,
          16,
          root
        );
        phantom.internal.loadingState = 0;
        Object.assign(phantom.engineData.boundingVolume, {
          getOBB: (target: THREE.Box3, targetTransform: THREE.Matrix4) => {
            target.copy(localBox);
            targetTransform.copy(transform);
          },
        });
        // This missing tile overlaps only after the old ECEF-AABB roundtrip.
        // It must not block either complete receiver/caster publication stage.
        root.children.push(phantom);
      }
      for (const tile of [
        root,
        coarseReceiver,
        coarseCaster,
        fineReceiver,
        fineCaster,
        ...(cityRootFallback ? [unrelated, fringe] : []),
      ]) {
        renderer!.lruCache.add(tile, () => {});
      }
      runtime.setShadowView({
        camera: sun,
        shadowMapSize: { width: 1024, height: 1024 },
      });
      try {
        proposed = new Set(
          cityRootFallback ? [root] : [coarseReceiver, coarseCaster]
        );
        runtime.update(frame);
        expect(renderer!.visibleTiles).toEqual(
          new Set([
            coarseReceiver,
            coarseCaster,
            ...(cityRootFallback ? [fringe] : []),
          ])
        );

        proposed = new Set([fineReceiver, coarseCaster]);
        runtime.update(frame);
        expect(renderer!.visibleTiles).toEqual(
          new Set([
            coarseReceiver,
            coarseCaster,
            ...(cityRootFallback ? [fringe] : []),
          ])
        );
        expect(renderer!.visibleTiles.has(fineReceiver)).toBe(false);
        expect(renderer!.visibleTiles.has(unrelated)).toBe(false);
        const coarseReceiverWorld = bounds
          .clone()
          .applyMatrix4(renderer!.group.matrixWorld);
        const coarseCorridorWorld = coarseReceiverWorld
          .clone()
          .union(
            bounds
              .clone()
              .translate(sunward)
              .applyMatrix4(renderer!.group.matrixWorld)
          );
        expect(
          runtime.isShadowRegionReady?.(
            coarseCorridorWorld,
            16,
            coarseReceiverWorld
          )
        ).toBe(true);
        expect(
          runtime.isShadowRegionReady?.(
            coarseCorridorWorld,
            1,
            coarseReceiverWorld
          )
        ).toBe(false);
        if (cityRootFallback) {
          const retained = runtime
            .getActiveTileVolumes?.()
            .find((tile) => tile.id.includes("coarse-fringe"));
          // Pending fine coverage excludes this tile. Until replacement, its
          // committed coarse receiver must still provide a finite pixel error.
          expect(retained).toBeDefined();
          expect(Number.isFinite(retained?.errorPixels)).toBe(true);
          expect(retained?.loadReason).toBe("shadow");
          // Keep the pre-existing pressure-recovery case separate from the
          // presentation handshake: its artificial clock intentionally holds
          // pressure across following frames and evicts unacknowledged detail.
          if (presentation === "off") {
            const premature = makeTile(
              "premature-fine",
              fineBounds,
              true,
              0.1,
              fineReceiver
            );
            premature.internal.loadingState = 2;
            fineReceiver.children.push(premature);
            renderer!.lruCache.add(premature, () => {});
            renderer!.loadingTiles.add(premature);
            const memoryDescriptor = Object.getOwnPropertyDescriptor(
              performance,
              "memory"
            );
            const now = vi.spyOn(performance, "now").mockReturnValue(1e9);
            Object.defineProperty(performance, "memory", {
              configurable: true,
              value: { usedJSHeapSize: 85, jsHeapSizeLimit: 100 },
            });
            try {
              runtime.update(frame);
              expect(renderer!.lruCache.has(premature)).toBe(false);
              expect(renderer!.lruCache.has(coarseReceiver)).toBe(true);
              expect(renderer!.lruCache.has(coarseCaster)).toBe(true);
              expect(renderer!.lruCache.has(fringe)).toBe(true);
            } finally {
              now.mockRestore();
              if (memoryDescriptor)
                Object.defineProperty(performance, "memory", memoryDescriptor);
              else Reflect.deleteProperty(performance, "memory");
            }
          }
        }

        fineCaster.internal.loadingState = 4;
        renderer!.dispatchEvent({
          type: "load-model",
          scene: fineCaster.engineData.scene,
          tile: fineCaster,
          url: "https://example.test/mesh/caster1.b3dm",
        });
        runtime.update(frame);
        if (presentation !== "off") {
          expect(renderer!.visibleTiles.has(coarseReceiver)).toBe(true);
          expect(renderer!.visibleTiles.has(fineReceiver)).toBe(false);
          const receiverId = runtime
            .getActiveTileVolumes?.()
            .find((tile) => tile.id.includes("receiver16"))?.id;
          expect(receiverId).toBeDefined();
          runtime.acknowledgeShadowStage?.(["stale-or-unknown-receiver"]);
          runtime.update(frame);
          expect(renderer!.visibleTiles.has(coarseReceiver)).toBe(true);
          if (presentation === "disabled")
            runtime.setShadowStagePresentationGate?.(false);
          else runtime.acknowledgeShadowStage?.([receiverId!]);
          runtime.update(frame);
        }
        expect(renderer!.visibleTiles).toEqual(
          new Set([fineReceiver, fineCaster])
        );
        const receiverWorld = fineBounds
          .clone()
          .applyMatrix4(renderer!.group.matrixWorld);
        const corridorWorld = receiverWorld
          .clone()
          .union(
            bounds
              .clone()
              .translate(sunward)
              .applyMatrix4(renderer!.group.matrixWorld)
          );
        runtime.update(frame);
        expect(
          runtime.isShadowRegionReady?.(corridorWorld, 1, receiverWorld)
        ).toBe(true);
        const revision = runtime.getShadowRegionRevision?.(
          corridorWorld,
          1,
          receiverWorld
        );
        expect(revision).toContain("receiver1.b3dm");
        expect(revision).toContain("caster1.b3dm");
        const diagnostics = runtime.getShadowRegionDiagnostics?.(
          corridorWorld,
          1,
          receiverWorld
        );
        expect(diagnostics?.selectedTileIds).toHaveLength(2);
        expect(diagnostics?.receiverPrismTested).toBe(true);
        expect(
          runtime.getShadowRegionDiagnostics?.(corridorWorld, 1, receiverWorld)
        ).toBe(diagnostics);
        sun.left *= 2;
        sun.updateProjectionMatrix();
        runtime.setShadowView({
          camera: sun,
          shadowMapSize: { width: 1024, height: 1024 },
        });
        // A global fetch envelope refit does not unpublish complete regional
        // coverage while unrelated traversal work is pending.
        expect(
          runtime.isShadowRegionReady?.(corridorWorld, 1, receiverWorld)
        ).toBe(true);
        expect(
          runtime
            .getActiveTileVolumes?.()
            .filter((tile) => tile.loadReason === "viewport")
            .every((tile) => tile.errorPixels === 1)
        ).toBe(true);
      } finally {
        runtime.dispose();
        nativeError.mockRestore();
        update.mockRestore();
      }
    }
  );
});
