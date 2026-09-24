import {
  isPointerChannel,
  isPointerSample,
  pointerSessionCode,
  pointerToPixels,
  type PointerSample,
} from "./pointer";

const sample: PointerSample = {
  on: true,
  mode: "spotlight",
  dx: 0.1,
  dy: -0.2,
  vx: 0,
  vy: 0,
  radius: 0.06,
  dim: 0.75,
  seq: 3,
};

describe("pointerSessionCode", () => {
  it("names a session the relay accepts next to the scene session", () => {
    expect(pointerSessionCode(" ooc0eeQu ")).toBe("OOC0EEQU-P");
    expect(pointerSessionCode("ooc0eeQu")).toMatch(/^[A-Z0-9_-]{4,32}$/);
  });
});

describe("isPointerSample", () => {
  it("takes a complete sample", () => {
    expect(isPointerSample(sample)).toBe(true);
  });

  it("refuses unknown modes and missing numbers", () => {
    expect(isPointerSample({ ...sample, mode: "laser" })).toBe(false);
    expect(isPointerSample({ ...sample, dx: Number.NaN })).toBe(false);
    expect(isPointerSample({ ...sample, seq: undefined })).toBe(false);
    expect(isPointerSample(null)).toBe(false);
  });
});

describe("isPointerChannel", () => {
  it("needs a session and an epoch", () => {
    expect(isPointerChannel({ session: "ABCD-P", epoch: 1 })).toBe(true);
    expect(isPointerChannel({ session: "", epoch: 1 })).toBe(false);
    expect(isPointerChannel({ session: "ABCD-P" })).toBe(false);
  });
});

describe("pointerToPixels", () => {
  const box = { left: 10, top: 20, width: 400, height: 200 };

  it("puts no offset on the middle of the box", () => {
    expect(pointerToPixels(box, 0, 0)).toEqual({ x: 210, y: 120 });
  });

  it("scales both axes by the box width", () => {
    expect(pointerToPixels(box, 0.5, 0.25)).toEqual({ x: 410, y: 220 });
  });

  it("keeps the spot near the model", () => {
    expect(pointerToPixels(box, 9, -9)).toEqual({ x: 510, y: -180 });
  });
});
