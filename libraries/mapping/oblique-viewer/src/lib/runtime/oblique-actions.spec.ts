import { describe, expect, it } from "vitest";
import {
  OBLIQUE_STATE_DEFAULT,
  requestObliqueCommand,
  acknowledgeObliqueRequest,
} from "./oblique-actions";

describe("oblique viewer commands", () => {
  it("keeps successive commands distinct after the previous request is acknowledged", () => {
    const first = requestObliqueCommand(OBLIQUE_STATE_DEFAULT, {
      type: "rotate",
      clockwise: true,
    });
    const cleared = acknowledgeObliqueRequest(first, first.request!.seq);
    const second = requestObliqueCommand(cleared, {
      type: "rotate",
      clockwise: true,
    });
    expect(cleared.request).toBeNull();
    expect(second.request!.seq).toBeGreaterThan(first.request!.seq);
    expect(second.request!.seq).toBe(2);
  });

  it("does not clear a newer command when an older flight acknowledges late", () => {
    const first = requestObliqueCommand(OBLIQUE_STATE_DEFAULT, {
      type: "flyToImage",
    });
    const second = requestObliqueCommand(first, { type: "closePreview" });
    expect(acknowledgeObliqueRequest(second, first.request!.seq)).toBe(second);
  });
});
