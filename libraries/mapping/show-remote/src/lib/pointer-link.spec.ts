import { isPointerChannel, pointerSessionCode } from "./pointer";
import {
  isPointerLinkDescription,
  isPointerLinkPing,
  isPointerLinkPong,
  isPointerLinkSessions,
  parseLinkMessage,
  pointerLinkSessions,
} from "./pointer-link";

describe("pointerLinkSessions", () => {
  it("names two sessions the relay accepts next to the pointer session", () => {
    const sessions = pointerLinkSessions(pointerSessionCode("ooc0eeQu"));
    expect(sessions).toEqual({ offer: "OOC0EEQU-PO", answer: "OOC0EEQU-PA" });
    expect(sessions.offer).toMatch(/^[A-Z0-9_-]{4,32}$/);
    expect(sessions.answer).toMatch(/^[A-Z0-9_-]{4,32}$/);
  });
});

describe("isPointerLinkSessions", () => {
  it("wants both names", () => {
    expect(isPointerLinkSessions({ offer: "A-PO", answer: "A-PA" })).toBe(true);
    expect(isPointerLinkSessions({ offer: "A-PO" })).toBe(false);
    expect(isPointerLinkSessions({ offer: "", answer: "A-PA" })).toBe(false);
    expect(isPointerLinkSessions(null)).toBe(false);
  });
});

describe("isPointerChannel with a direct link", () => {
  it("takes a channel without the link, as older phones send it", () => {
    expect(isPointerChannel({ session: "A-P", epoch: 1 })).toBe(true);
  });

  it("takes a channel with the link sessions", () => {
    expect(
      isPointerChannel({
        session: "A-P",
        epoch: 1,
        direct: { offer: "A-PO", answer: "A-PA" },
      })
    ).toBe(true);
  });

  it("refuses a malformed link entry", () => {
    expect(
      isPointerChannel({ session: "A-P", epoch: 1, direct: { offer: "A-PO" } })
    ).toBe(false);
  });
});

describe("isPointerLinkDescription", () => {
  it("wants an id and an sdp", () => {
    expect(isPointerLinkDescription({ id: "x", sdp: "v=0" })).toBe(true);
    expect(isPointerLinkDescription({ id: "", sdp: "v=0" })).toBe(false);
    expect(isPointerLinkDescription({ id: "x" })).toBe(false);
    expect(isPointerLinkDescription(null)).toBe(false);
  });
});

describe("link messages", () => {
  it("tells pings and pongs apart", () => {
    expect(isPointerLinkPing({ ping: 12.5 })).toBe(true);
    expect(isPointerLinkPing({ pong: 12.5 })).toBe(false);
    expect(isPointerLinkPong({ pong: 12.5 })).toBe(true);
    expect(isPointerLinkPong({ pong: Number.NaN })).toBe(false);
  });

  it("parses JSON text and nothing else", () => {
    expect(parseLinkMessage('{"ping":1}')).toEqual({ ping: 1 });
    expect(parseLinkMessage("not json")).toBeUndefined();
    expect(parseLinkMessage(new ArrayBuffer(4))).toBeUndefined();
  });
});
