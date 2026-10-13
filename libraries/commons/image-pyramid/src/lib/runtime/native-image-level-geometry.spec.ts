import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  parseNativeAvif,
  type StandaloneAvifDocument,
} from "../core/avif-native-convention";
import documentFixture from "../core/__fixtures__/oblique-document.json";
import {
  nativeLevelEntry,
  type NativeAvifBootstrap,
} from "./native-avif-byte-source";

const makeBootstrap = (withSensor: boolean): NativeAvifBootstrap => {
  const bytes = Uint8Array.from(
    readFileSync(
      new URL(
        "../core/__fixtures__/native-four-two-cells.avif",
        import.meta.url
      )
    )
  );
  const layout = parseNativeAvif(bytes)!;
  layout.index.dimensions = { width: 5326, height: 7102 };
  for (const [level, index] of layout.levels)
    index.dimensions = {
      width: Math.ceil(5326 / 2 ** (level - 1)),
      height: Math.ceil(7102 / 2 ** (level - 1)),
    };
  const document = withSensor
    ? (structuredClone(documentFixture) as unknown as StandaloneAvifDocument)
    : null;
  if (document) {
    document.pixelMapping.primaryDimensions = [5326, 7102];
    document.pixelMapping.calibrationDimensions = [10652, 14204];
  }
  return { bytes, layout, document };
};

describe("native pixel-edge scale metadata", () => {
  it.each([false, true])(
    "uses exact spacing with sensor document %s despite rounded output sizes",
    (withSensor) => {
      const bootstrap = makeBootstrap(withSensor);
      for (let level = 1; level <= 4; level++) {
        const entry = nativeLevelEntry(bootstrap, level);
        const scale = 2 ** (level - (withSensor ? 0 : 1));
        expect(entry.nativeScale).toEqual({ x: scale, y: scale });
        expect(entry.scale).toBe(1 / scale);
        expect(entry.width).toBe(Math.ceil(5326 / 2 ** (level - 1)));
        expect(entry.height).toBe(Math.ceil(7102 / 2 ** (level - 1)));
      }
      const coarse = nativeLevelEntry(bootstrap, 3);
      expect(coarse.scale).not.toBe(
        coarse.height / (withSensor ? 14204 : 7102)
      );
    }
  );
  it("converts the calibrated half-pixel center affine to zero-offset pixel edges", () => {
    const bootstrap = makeBootstrap(true);
    for (let level = 1; level <= 4; level++) {
      const entry = nativeLevelEntry(bootstrap, level);
      const affine =
        bootstrap.document!.pixelMapping.levelToSensorAffine[String(level)];
      for (const edge of [0, 256, 512, 7102 / 2 ** (level - 1)]) {
        expect(affine[0][0] * (edge - 0.5) + affine[0][2] + 0.5).toBe(
          edge * entry.nativeScale.x
        );
        expect(affine[1][1] * (edge - 0.5) + affine[1][2] + 0.5).toBe(
          edge * entry.nativeScale.y
        );
      }
    }
  });
});
