import { describe, expect, it } from "vitest";

import { relayLinkFor } from "./relay-link";

describe("relayLinkFor", () => {
  it("puts the code into the hash of the geoportal root", () => {
    expect(relayLinkFor("https://example.org/geoportal/#/", "T852B")).toBe(
      "https://example.org/geoportal/#/?relay=T852B"
    );
  });

  it("adds the code to the parameters the outlet link already has", () => {
    expect(
      relayLinkFor("https://example.org/geoportal/#/outlet?ff=ng", "T852B")
    ).toBe("https://example.org/geoportal/#/outlet?ff=ng&relay=T852B");
  });

  it("looks only at the hash when choosing between ? and &", () => {
    expect(relayLinkFor("https://example.org/?lang=de#/", "T852B")).toBe(
      "https://example.org/?lang=de#/?relay=T852B"
    );
  });

  it("encodes the code", () => {
    expect(relayLinkFor("https://example.org/#/", "A&B C")).toBe(
      "https://example.org/#/?relay=A%26B%20C"
    );
  });
});
