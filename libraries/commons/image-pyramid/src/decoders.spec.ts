// @vitest-environment node
import { describe, expect, it } from "vitest";

describe("worker-safe decoder entry", () => {
  it("imports the public AVIF and TIFF decoders without window or document", async () => {
    expect(typeof window).toBe("undefined");
    expect(typeof document).toBe("undefined");

    const decoders = await import("@carma-commons/image-pyramid/decoders");

    expect(typeof decoders.AvifPyramidPreviewSource).toBe("function");
    expect(typeof decoders.createTiffPreviewSource).toBe("function");
    expect(typeof window).toBe("undefined");
    expect(typeof document).toBe("undefined");
  });
});
