import type { Map as MaplibreMap, PaddingOptions } from "maplibre-gl";
import { describe, expect, it } from "vitest";
import type { CssPixels } from "@carma-units";
import { acquirePreviewProjectionWindow } from "./preview-projection-window";

class Point {
  constructor(public x: number, public y: number) {}
  clone() {
    return new Point(this.x, this.y);
  }
  sub(point: Point) {
    return new Point(this.x - point.x, this.y - point.y);
  }
  add(point: Point) {
    return new Point(this.x + point.x, this.y + point.y);
  }
}

// Reproduce the installed EdgeInsets clamp and the public transform clone contract.
class TransformFixture {
  width = 800 as CssPixels;
  height = 600 as CssPixels;
  padding: PaddingOptions = { left: 0, right: 0, top: 0, bottom: 0 };
  projectedOffset = new Point(0, 0);
  get centerPoint() {
    return new Point(
      Math.max(
        0,
        Math.min(
          this.width,
          (this.width + this.padding.left - this.padding.right) / 2
        )
      ),
      Math.max(
        0,
        Math.min(
          this.height,
          (this.height + this.padding.top - this.padding.bottom) / 2
        )
      )
    );
  }
  get centerOffset() {
    return this.centerPoint.sub(new Point(this.width / 2, this.height / 2));
  }
  getCameraPoint() {
    // MapLibre's method delegates to its helper's original clamped centre.
    const center = Object.getOwnPropertyDescriptor(
      TransformFixture.prototype,
      "centerPoint"
    )!.get!.call(this) as Point;
    return center.add(new Point(0, 50));
  }
  apply(source: TransformFixture, _constrain: boolean) {
    this.width = source.width;
    this.height = source.height;
    this.padding = { ...source.padding };
    this.projectedOffset = this.centerOffset.clone();
  }
  clone() {
    const copy = new TransformFixture();
    copy.apply(this, false);
    return copy;
  }
}
const mapFor = (transform: TransformFixture) =>
  ({ transform } as unknown as MaplibreMap);

describe("calibrated preview projection window", () => {
  it("preserves off-screen perspective centres in matrices, picking and clones, then restores every instance", () => {
    const transform = new TransformFixture();
    const originalClone = transform.clone;
    const release = acquirePreviewProjectionWindow(mapFor(transform));
    transform.padding = { left: 5000, right: 0, top: 0, bottom: 2000 };
    transform.apply(transform, false);
    expect(transform.centerOffset).toEqual(new Point(2500, -1000));
    expect(transform.projectedOffset).toEqual(transform.centerOffset);
    expect(transform.getCameraPoint()).toEqual(new Point(2900, -650));
    const copy = transform.clone();
    const grandchild = copy.clone();
    for (const child of [copy, grandchild]) {
      expect(child.centerOffset).toEqual(transform.centerOffset);
      expect(child.projectedOffset).toEqual(transform.projectedOffset);
      expect(child.getCameraPoint()).toEqual(transform.getCameraPoint());
    }
    release();
    release();
    expect(transform.clone).toBe(originalClone);
    for (const target of [transform, copy, grandchild]) {
      expect(
        Object.getOwnPropertyDescriptor(target, "centerOffset")
      ).toBeUndefined();
      expect(target.centerOffset).toEqual(new Point(400, -300));
      expect(target.projectedOffset).toEqual(target.centerOffset);
      expect(target.getCameraPoint()).toEqual(new Point(800, 50));
    }
    expect(transform.clone().centerOffset).toEqual(transform.centerOffset);
  });
  it("limits changes to its transform instance and supports a fresh preview lease", () => {
    const owner = new TransformFixture();
    const unrelated = new TransformFixture();
    owner.padding.left = unrelated.padding.left = 2000;
    const release = acquirePreviewProjectionWindow(mapFor(owner));
    expect(owner.centerOffset.x).toBe(1000);
    expect(unrelated.centerOffset.x).toBe(400);
    release();
    const releaseAgain = acquirePreviewProjectionWindow(mapFor(owner));
    expect(owner.centerOffset.x).toBe(1000);
    releaseAgain();
    expect(owner.centerOffset.x).toBe(400);
  });
});
