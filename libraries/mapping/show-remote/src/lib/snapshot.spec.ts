import {
  isSnapshot,
  isSnapshotRequest,
  snapshotSessionCode,
  snapshotTarget,
} from "./snapshot";

describe("snapshot", () => {
  it("names the session next to the display's", () => {
    expect(snapshotSessionCode(" wupp1 ")).toBe("WUPP1-S");
    expect(
      snapshotTarget({ baseUrl: "https://relay.example", code: "wupp1" })
    ).toEqual({ baseUrl: "https://relay.example", code: "WUPP1-S" });
  });

  it("takes a request with a numeric id only", () => {
    expect(isSnapshotRequest({ id: 3 })).toBe(true);
    expect(isSnapshotRequest({ id: "3" })).toBe(false);
    expect(isSnapshotRequest(null)).toBe(false);
  });

  it("takes a picture or a reason", () => {
    expect(
      isSnapshot({
        id: 1,
        image: "data:image/jpeg;base64,AA",
        width: 480,
        height: 267,
      })
    ).toBe(true);
    expect(isSnapshot({ id: 1, error: "no map" })).toBe(true);
  });

  it("rejects a picture without a size or a data url", () => {
    expect(
      isSnapshot({
        id: 1,
        image: "data:image/jpeg;base64,AA",
        width: 0,
        height: 267,
      })
    ).toBe(false);
    expect(
      isSnapshot({
        id: 1,
        image: "https://example.com/a.jpg",
        width: 480,
        height: 267,
      })
    ).toBe(false);
    expect(isSnapshot({ id: 1 })).toBe(false);
  });
});
