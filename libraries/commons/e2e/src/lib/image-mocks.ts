import { BrowserContext } from "@playwright/test";
const BLANK_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+8V/8AAAAASUVORK5CYII=";

const simpleAdressen = [
  {
    s: "Achenbachstr.",
    nr: 1,
    z: "",
    g: "home",
    x: 793007.83,
    y: 6668501.93,
    m: { zl: 18 },
  },
  {
    s: "Achenbachstr.",
    nr: 9,
    z: "",
    g: "home",
    x: 793053.3,
    y: 6668415.06,
    m: { zl: 18 },
  },
  {
    s: "Achenbachtreppe",
    nr: 0,
    z: "",
    g: "road",
    x: 793022.68,
    y: 6668515.97,
    m: { zl: 18 },
  },
];
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
 * Mock addresses data with provided mock data
 */
export async function mockAddresses(
  context: BrowserContext,
  mockedAdressen: any[]
) {
  await context.route("**/v2/data/**/adressen.json*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockedAdressen),
    })
  );
}

/**
 * Mock other datasets as empty arrays to avoid extra suggestions
 */
export async function mockEmptyDatasets(
  context: BrowserContext,
  datasets: string[] = [],
  mockedAdressen: any[] = []
) {
  for (const name of datasets) {
    await context.route(`**/v2/data/**/${name}.json*`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "[]",
      })
    );
  }

  mockAddresses(context, mockedAdressen);
}

/**
 * Setup all common image mocks at once
 */
export async function setupAllMocks(context: BrowserContext, mockedAdressen: any[] = ["bezirke", "quartiere", "pois", "kitas"], addresses: any[] = simpleAdressen) {
  await Promise.all([
    mockWMSImages(context),
    mockRasterTiles(context),
    mockVectorTiles(context),
    mockWMTSTiles(context),
    mockEmptyDatasets(context, mockedAdressen, addresses),
  ]);
}
