import { describe, expect, it } from "vitest";

describe("tiles3d layer visibility", () => {
  it("can be hidden and shown again without disposing its scene root", async () => {
    Object.defineProperty(window.URL, "createObjectURL", {
      configurable: true,
      value: () => "blob:vitest-maplibre-worker",
    });
    const { buildTiles3dLayer } = await import("./tiles3dLayer");
    const layer = buildTiles3dLayer("mesh", "tileset.json", [7.15, 51.25]);
    const root = layer.root;

    layer.setVisible(false);
    expect(layer.root).toBe(root);
    expect(root.visible).toBe(false);

    layer.setVisible(true);
    expect(layer.root).toBe(root);
    expect(root.visible).toBe(true);

    layer.dispose();
  });
});
