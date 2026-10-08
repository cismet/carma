import type { DevicePixels, Ratio } from "@carma-units";
import type { ImageLevel, ImageView } from "../core/image-level-plan";
import { ImageLevelStack } from "./image-level-stack";
import type {
  ImagePyramid,
  ImageTileRef,
  ImageTileSource,
} from "./image-tile-source";

const native = { width: 12736 as DevicePixels, height: 19136 as DevicePixels };
const levels: ImageLevel[] = [
  [1, 6368, 9568],
  [2, 3184, 4784],
  [3, 1592, 2392],
  [4, 796, 1196],
  [5, 398, 598],
].map(([level, width, height]) => ({
  level,
  width: width as DevicePixels,
  height: height as DevicePixels,
  tileWidth: Math.min(512, width) as DevicePixels,
  tileHeight: Math.min(512, height) as DevicePixels,
  cols: Math.ceil(width / 512),
  rows: Math.ceil(height / 512),
}));
const key = (tile: ImageTileRef) => `${tile.level}:${tile.col}:${tile.row}`;

class FakeSource implements ImageTileSource {
  readonly kind = "avif" as const;
  readonly url = "https://example.invalid/a.avif";
  readonly local = new Set<string>();
  readonly fetches: ImageTileRef[][] = [];
  readonly decodes: string[] = [];
  readonly bitmaps: { close: () => void; closed: boolean }[] = [];
  compressedBytes = 0;
  requestCount = 0;
  open = async (): Promise<ImagePyramid> => ({ native, levels });
  hasBytes = (tile: ImageTileRef) => this.local.has(key(tile));
  fetch = async (tiles: readonly ImageTileRef[]) => {
    this.fetches.push([...tiles]);
    tiles.forEach((tile) => this.local.add(key(tile)));
  };
  decode = async (tile: ImageTileRef) => {
    this.decodes.push(key(tile));
    const bitmap = {
      width: 512,
      height: 512,
      closed: false,
      close() {
        this.closed = true;
      },
    };
    this.bitmaps.push(bitmap);
    return bitmap as unknown as ImageBitmap;
  };
  paused = 0;
  pause = () => {
    this.paused++;
  };
  dispose = () => undefined;
}

const view = (cx: number, cy: number, density: number): ImageView => ({
  visible: {
    x: (cx - 700 / density) as DevicePixels,
    y: (cy - 415 / density) as DevicePixels,
    width: (1400 / density) as DevicePixels,
    height: (830 / density) as DevicePixels,
  },
  density: density as Ratio,
});
const settle = async () => {
  for (let i = 0; i < 200; i++) await Promise.resolve();
};
const MiB = 1024 * 1024;

describe("ImageLevelStack", () => {
  it("decodes the underlay before the target and never exceeds its budget", async () => {
    const source = new FakeSource();
    const stack = new ImageLevelStack(source, {
      decodedBudget: () => 40 * MiB,
      idlePrefetch: "none",
    });
    await stack.ready;
    stack.setView(view(6000, 9000, 0.3), 1400 * 830);
    await settle();
    const first = (level: number) =>
      source.decodes.findIndex((tile) => tile.startsWith(`${level}:`));
    // Floor, then the parent underlay, then the target level.
    expect(first(5)).toBe(0);
    expect(first(2)).toBeLessThan(first(1));
    expect(stack.metrics.decodedBytes).toBeLessThanOrEqual(40 * MiB);
    expect(stack.metrics.visibleReady).toBe(true);
  });

  it("batches missing tiles of one level and priority into one fetch", async () => {
    const source = new FakeSource();
    const stack = new ImageLevelStack(source, { idlePrefetch: "none" });
    await stack.ready;
    stack.setView(view(6000, 9000, 0.3), 1400 * 830);
    await settle();
    for (const batch of source.fetches)
      expect(new Set(batch.map((tile) => tile.level)).size).toBe(1);
    expect(source.fetches[0].length).toBeGreaterThan(1);
  });

  it("does not replan or notify for an unchanged view", async () => {
    const source = new FakeSource();
    const stack = new ImageLevelStack(source, { idlePrefetch: "none" });
    await stack.ready;
    stack.setView(view(6000, 9000, 0.3), 1400 * 830);
    await settle();
    const changes = vi.fn();
    stack.subscribe(changes);
    stack.setView(view(6000, 9000, 0.3), 1400 * 830);
    await settle();
    expect(changes).not.toHaveBeenCalled();
  });

  it("evicts tiles outside the plan first when the view moves", async () => {
    const source = new FakeSource();
    const stack = new ImageLevelStack(source, {
      decodedBudget: () => 48 * MiB,
      idlePrefetch: "none",
    });
    await stack.ready;
    const evicted: string[] = [];
    stack.onEvict((tile) => evicted.push(tile));
    stack.setView(view(3000, 3000, 0.3), 1400 * 830);
    await settle();
    stack.setView(view(9000, 15000, 0.3), 1400 * 830);
    await settle();
    expect(stack.metrics.decodedBytes).toBeLessThanOrEqual(48 * MiB);
    expect(stack.metrics.visibleReady).toBe(true);
    const plan = new Set(
      stack.plan!.wants.filter((want) => want.decode).map((want) => want.key)
    );
    expect(evicted.some((tile) => plan.has(tile))).toBe(false);
  });

  it("parks to a small budget keeping the floor, and resumes on the next view", async () => {
    const source = new FakeSource();
    const stack = new ImageLevelStack(source, {
      parkedBudgetBytes: 4 * MiB,
      idlePrefetch: "none",
    });
    await stack.ready;
    stack.setView(view(6000, 9000, 0.1), 1400 * 830);
    await settle();
    expect(stack.plan!.floor).toBe(5);
    stack.park();
    expect(source.paused).toBe(1);
    expect(stack.metrics.decodedBytes).toBeLessThanOrEqual(4 * MiB);
    expect(stack.isResident(5, 0, 0)).toBe(true);
    stack.setView(view(6000, 9000, 0.1), 1400 * 830);
    await settle();
    expect(stack.metrics.visibleReady).toBe(true);
  });

  it("closes every bitmap on dispose", async () => {
    const source = new FakeSource();
    const stack = new ImageLevelStack(source, { idlePrefetch: "none" });
    await stack.ready;
    stack.setView(view(6000, 9000, 0.3), 1400 * 830);
    await settle();
    stack.dispose();
    expect(source.bitmaps.every((bitmap) => bitmap.closed)).toBe(true);
  });
});
