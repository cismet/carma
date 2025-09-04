import { BrowserContext } from "@playwright/test";
const BLANK_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+8V/8AAAAASUVORK5CYII=";
/**
 * Mock WMS GetMap requests with a blank PNG
 */
export async function mockWMSImages(context: BrowserContext) {
  await context.route(/GetMap|SERVICE=WMS/i, (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/png",
      body: Buffer.from(BLANK_PNG, "base64"),
    })
  );
}
/**
 * Mock raster tile requests (PNG, JPG, JPEG, WebP)
 */
export async function mockRasterTiles(context: BrowserContext) {
  await context.route(/\/tiles\/.+\.(png|jpg|jpeg|webp)(\?.*)?$/i, (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/png",
      body: Buffer.from(BLANK_PNG, "base64"),
    })
  );
}
/**
 * Mock vector tiles (MVT/PBF) with empty response
 */
export async function mockVectorTiles(context: BrowserContext) {
  await context.route(/\.(pbf)(\?.*)?$/i, (route) =>
    route.fulfill({
      status: 204,
      contentType: "application/x-protobuf",
      body: "",
    })
  );
}
/**
 * Mock WMTS tiles from metropoleruhr.de/spw2
 */
export async function mockWMTSTiles(context: BrowserContext) {
  await context.route(
    (url) => {
      try {
        const u = new URL(url);
        return (
          u.hostname.endsWith("metropoleruhr.de") &&
          u.pathname.endsWith("/spw2") &&
          (u.searchParams.get("SERVICE") || "").toUpperCase() === "WMTS" &&
          (u.searchParams.get("REQUEST") || "").toLowerCase() === "gettile" &&
          (u.searchParams.get("FORMAT") || "").toLowerCase().includes("image")
        );
      } catch {
        return false;
      }
    },
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "image/png",
        body: Buffer.from(BLANK_PNG, "base64"),
      })
  );
}
/**
 * Setup all common image mocks at once
 */
export async function setupAllImageMocks(context: BrowserContext) {
  await Promise.all([
    mockWMSImages(context),
    mockRasterTiles(context),
    mockVectorTiles(context),
    mockWMTSTiles(context),
  ]);
}
