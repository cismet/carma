import { describe, expect, it } from "vitest";

import { cacheableWms } from "./cacheable-wms";

const CITY = "https://maps.wuppertal.de/karten";
const CLOUD = "https://geo.udsp.wuppertal.de/geoserver-cloud/wms";

describe("cacheableWms", () => {
  it("takes the orthophoto from geoserver-cloud instead of the city's no-store service", () => {
    expect(
      cacheableWms({ url: CITY, layers: "R102:trueortho2024", transparent: true }, "")
    ).toEqual({ url: CLOUD, layers: "GIS-102:trueortho2024", transparent: true });
  });

  it("matches the city's url with a trailing question mark", () => {
    expect(cacheableWms({ url: `${CITY}?`, layers: "R102:trueortho2024" }, "")).toEqual({
      url: CLOUD,
      layers: "GIS-102:trueortho2024",
    });
  });

  it("asks for JPEG on a page with cache=forced", () => {
    expect(
      cacheableWms(
        { url: CITY, layers: "R102:trueortho2024", transparent: true },
        "cache=forced&relay=abc"
      )
    ).toEqual({
      url: CLOUD,
      layers: "GIS-102:trueortho2024",
      format: "image/jpeg",
      transparent: false,
    });
  });

  it("asks a catalog row that already names geoserver-cloud for JPEG too", () => {
    expect(
      cacheableWms({ url: CLOUD, layers: "GIS-102:trueortho2024" }, "cache=forced")
    ).toMatchObject({ url: CLOUD, format: "image/jpeg", transparent: false });
  });

  it("leaves every other layer as it is", () => {
    const request = { url: CITY, layers: "R102:luftbild1979", transparent: true };
    expect(cacheableWms(request, "cache=forced")).toBe(request);
  });
});
