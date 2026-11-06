import {
  isShowNotice,
  showNoticeSessionCode,
  showNoticeTarget,
} from "./show-notice";

describe("show notice", () => {
  it("names the session after the show's key", () => {
    expect(showNoticeSessionCode(" 86e1ea2376700493 ")).toBe(
      "86E1EA2376700493-S"
    );
    expect(showNoticeTarget("http://relay", "abcd1234")).toEqual({
      baseUrl: "http://relay",
      code: "ABCD1234-S",
    });
  });

  it("takes a key and a publish time, nothing else", () => {
    expect(
      isShowNotice({ key: "abcd1234", publishedAt: "2026-11-06T18:23:18Z" })
    ).toBe(true);
    expect(isShowNotice({ key: "abcd1234" })).toBe(false);
    expect(isShowNotice(null)).toBe(false);
    expect(isShowNotice("abcd1234")).toBe(false);
  });
});
