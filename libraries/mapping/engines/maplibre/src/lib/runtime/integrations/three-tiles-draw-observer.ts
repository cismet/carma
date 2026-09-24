import type { Camera, Object3D, WebGLRenderer } from "three";
import type { RuntimeTile } from "./three-tiles-runtime-types";

type Draw = {
  scene: Object3D;
  renderer: WebGLRenderer;
  epoch: object;
  frame: number;
};
export type TileDrawStatus = {
  published: number;
  loaded: number;
  mounted: number;
  submittedInAnyView: number;
  submittedInMainView: number;
  submittedThisMainFrame: number;
  evidence: "draw-submitted-not-pixel-visibility";
};

/** Draw submission evidence, not a GPU fence or proof of unoccluded pixels.
 * No per-frame React updates, GPU readbacks, or extra rendering.
 */
export function createTileDrawObserver(
  onPrimaryDraw: (tile: RuntimeTile) => void,
  onShadowDraw?: (tile: RuntimeTile) => void
) {
  const records = new WeakMap<RuntimeTile, { any?: Draw; main?: Draw }>();
  const shadowFrames = new WeakMap<RuntimeTile, number>();
  const epochs = new WeakMap<HTMLCanvasElement, object>();
  const contextCleanup = new Set<() => void>();
  const hooks = new Map<Object3D, () => void>();
  let primary: Camera | null = null;
  let frame = 0;
  const epoch = (renderer: WebGLRenderer) => {
    const canvas = renderer.domElement;
    if (!epochs.has(canvas)) {
      epochs.set(canvas, {});
      const invalidate = () => epochs.set(canvas, {});
      canvas.addEventListener("webglcontextlost", invalidate);
      canvas.addEventListener("webglcontextrestored", invalidate);
      contextCleanup.add(() => {
        canvas.removeEventListener("webglcontextlost", invalidate);
        canvas.removeEventListener("webglcontextrestored", invalidate);
      });
    }
    return epochs.get(canvas)!;
  };
  const valid = (draw: Draw | undefined, tile: RuntimeTile) =>
    !!draw &&
    draw.scene === tile.engineData?.scene &&
    epochs.get(draw.renderer.domElement) === draw.epoch &&
    !draw.renderer.getContext().isContextLost();
  return {
    beginFrame(camera: Camera) {
      primary = camera;
      frame++;
    },
    attach(tile: RuntimeTile, scene: Object3D) {
      if (hooks.has(scene)) return;
      const restore: Array<() => void> = [];
      scene.traverse((object) => {
        if (!(object as Object3D & { isMesh?: boolean }).isMesh) return;
        const before = object.onBeforeRender,
          after = object.onAfterRender;
        let calls = 0;
        const onBefore: typeof before = function (this: Object3D, ...args) {
          before.apply(this, args);
          calls = args[0].info.render.calls;
        };
        const onAfter: typeof after = function (this: Object3D, ...args) {
          const [renderer, , camera] = args;
          const submitted = renderer.info.render.calls > calls;
          after.apply(this, args);
          if (!submitted || renderer.getContext().isContextLost()) return;
          const record = records.get(tile) ?? {};
          const draw = { scene, renderer, epoch: epoch(renderer), frame };
          record.any = draw;
          if (camera === primary) {
            const firstThisFrame = record.main?.frame !== frame;
            record.main = draw;
            if (firstThisFrame) onPrimaryDraw(tile);
          }
          records.set(tile, record);
        };
        if (onShadowDraw) {
          const beforeShadow = object.onBeforeShadow;
          const afterShadow = object.onAfterShadow;
          let shadowCalls = 0;
          const onBeforeShadow: typeof beforeShadow = function (
            this: Object3D,
            ...args
          ) {
            beforeShadow.apply(this, args);
            shadowCalls = args[0].info.render.calls;
          };
          const onAfterShadow: typeof afterShadow = function (
            this: Object3D,
            ...args
          ) {
            const renderer = args[0];
            const submitted = renderer.info.render.calls > shadowCalls;
            afterShadow.apply(this, args);
            if (
              submitted &&
              shadowFrames.get(tile) !== frame &&
              !renderer.getContext().isContextLost()
            ) {
              shadowFrames.set(tile, frame);
              onShadowDraw(tile);
            }
          };
          object.onBeforeShadow = onBeforeShadow;
          object.onAfterShadow = onAfterShadow;
          restore.push(() => {
            if (object.onBeforeShadow === onBeforeShadow)
              object.onBeforeShadow = beforeShadow;
            if (object.onAfterShadow === onAfterShadow)
              object.onAfterShadow = afterShadow;
          });
        }
        object.onBeforeRender = onBefore;
        object.onAfterRender = onAfter;
        restore.push(() => {
          if (object.onBeforeRender === onBefore)
            object.onBeforeRender = before;
          if (object.onAfterRender === onAfter) object.onAfterRender = after;
        });
      });
      hooks.set(scene, () => {
        restore.forEach((fn) => fn());
        records.delete(tile);
        shadowFrames.delete(tile);
      });
    },
    detach(scene: Object3D) {
      hooks.get(scene)?.();
      hooks.delete(scene);
    },
    read(
      tiles: Iterable<RuntimeTile>,
      group: Object3D | undefined
    ): TileDrawStatus {
      const result = {
        published: 0,
        loaded: 0,
        mounted: 0,
        submittedInAnyView: 0,
        submittedInMainView: 0,
        submittedThisMainFrame: 0,
        evidence: "draw-submitted-not-pixel-visibility" as const,
      };
      const mounted = new Set(group?.children);
      for (const tile of tiles) {
        result.published++;
        const scene = tile.engineData?.scene;
        if (tile.internal.loadingState !== 4 || !scene) continue;
        result.loaded++;
        if (scene.parent !== group || !mounted.has(scene) || !scene.visible)
          continue;
        result.mounted++;
        const record = records.get(tile);
        if (valid(record?.any, tile)) result.submittedInAnyView++;
        if (valid(record?.main, tile)) {
          result.submittedInMainView++;
          if (record!.main!.frame === frame) result.submittedThisMainFrame++;
        }
      }
      return result;
    },
    dispose() {
      hooks.forEach((restore) => restore());
      hooks.clear();
      contextCleanup.forEach((cleanup) => cleanup());
      contextCleanup.clear();
    },
  };
}
