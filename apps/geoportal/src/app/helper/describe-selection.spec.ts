import { describe, expect, it } from "vitest";

import { describeSelection, plainText } from "./describe-selection";

describe("plainText", () => {
  it("leaves text without the html wrapper alone", () => {
    expect(plainText("a < b")).toBe("a < b");
  });

  it("keeps cells apart by a space and rows by a semicolon", () => {
    expect(
      plainText(
        "<html><table><tr><td>a</td><td>b</td></tr><tr><td>c</td></tr></table></html>"
      )
    ).toBe("a b; c");
  });

  it("drops images and trims separators at the ends", () => {
    expect(plainText('<html><img src="x.png"><div>a</div><br></html>')).toBe(
      "a"
    );
  });
});

describe("describeSelection", () => {
  it("is null without an entry", () => {
    expect(describeSelection(null)).toBeNull();
    expect(describeSelection({})).toBeNull();
  });

  it("takes the attributes of the source feature, without internal keys", () => {
    expect(
      describeSelection({
        properties: { header: "<html><b>h</b></html>", title: "t" },
        sourceFeature: {
          properties: { a: 1, b: " ", __fill: "#fff", carmaInfo: {}, c: null },
        },
      })
    ).toEqual({ header: "h", title: "t", properties: { a: 1 } });
  });

  it("follows a label feature to the area feature's attributes", () => {
    expect(
      describeSelection({
        properties: { title: "t", sourceProps: { targetProperties: { a: 2 } } },
      })
    ).toEqual({ title: "t", properties: { a: 2 } });
  });
});
