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
 * datasets: Add routes that return empty arrays
 * mockedAdressen: Add routes that return mocked addresses
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
 * Mock SVG icons with a simple gray circle
 */
export async function mockSVGIcons(context: BrowserContext) {
  // Mock poi-signaturen SVG files (stadtplan, vorhabenkarte)
  await context.route("**/poi-signaturen/**/*.svg", (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24">
               <circle cx="12" cy="12" r="10" fill="gray"/>
             </svg>`,
    })
  );

  // Mock /svgs/ path (e-bikes, e-auto-ladestation, x-and-ride)
  await context.route("**/svgs/**/*.svg", (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24">
               <circle cx="12" cy="12" r="10" fill="gray"/>
             </svg>`,
    })
  );

  // Mock any SVG file requests (broad pattern for baederkarte and others)
  await context.route("**/*.svg", (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24">
               <circle cx="12" cy="12" r="10" fill="gray"/>
             </svg>`,
    })
  );
}

/**
 * Universal data mocking function for topicmaps
 */
export async function mockTopicMapData(
  context: BrowserContext,
  dataType: string,
  mockData: any[]
) {
  await context.route(`**/v2/data/**/${dataType}.data.json*`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockData),
    })
  );
}

/**
 * Mock additional data files (like poi.farben.json)
 */
export async function mockAdditionalData(
  context: BrowserContext,
  pattern: string,
  mockData: any
) {
  await context.route(pattern, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockData),
    })
  );
}

/**
 * Mock OpenMapTiles hosting requests with empty responses
 */
export async function mockOMTMapHosting(context: BrowserContext) {
  await context.route("https://omt.map-hosting.de/**", (route) => {
    const url = route.request().url();

    if (url.endsWith(".json")) {
      // For JSON files (style.json, sprite.json, data/v3.json), return empty object or appropriate structure
      let emptyResponse = {};

      if (url.includes("style.json")) {
        emptyResponse = { version: 8, sources: {}, layers: [] };
      } else if (url.includes("sprite.json")) {
        emptyResponse = {};
      } else {
        emptyResponse = {};
      }

      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(emptyResponse),
      });
    } else {
      // For other resources, return empty response
      route.fulfill({
        status: 200,
        contentType: "text/plain",
        body: "",
      });
    }
  });
}

/**
 * Mock geoportal-specific services
 */
export async function mockGeoportalServices(context: BrowserContext) {
  const BLANK_PNG =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+8V/8AAAAASUVORK5CYII=";

  await Promise.all([
    // Mock geodaten.metropoleruhr.de/spw2 service with blank PNG
    context.route("https://geodaten.metropoleruhr.de/spw2/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "image/png",
        body: Buffer.from(BLANK_PNG, "base64"),
      })
    ),

    // Mock Cesium terrain service to return empty array
    context.route("https://cesium-wupp-terrain.cismet.de/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      })
    ),

    // Mock Matomo analytics service to return empty array
    context.route("https://wupptomo.cismet.de/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      })
    ),

    // Wupp 3D data service to return empty array
    context.route("https://wupp-3d-data.cismet.de/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      })
    ),

    // Mock Cesium approximateTerrainHeights.json - used for terrain height estimation
    // Returns minimal valid data structure with a few sample tiles
    // context.route(
    //   "**/__cesium__/Assets/approximateTerrainHeights.json",
    //   (route) =>
    //     route.fulfill({
    //       status: 200,
    //       contentType: "application/json",
    //       body: JSON.stringify({
    //         "6-0-0": [-60.9, 1359.39],
    //         "6-0-1": [-734.16, 2871.77],
    //         "6-1-0": [-100, 500],
    //         "6-1-1": [-200, 600],
    //       }),
    //     })
    // ),

    // Mock Icons8 service to return blank PNG
    context.route("https://img.icons8.com/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "image/png",
        body: Buffer.from(BLANK_PNG, "base64"),
      })
    ),

    // Mock Wupp Digital Twin assets data service to return empty array
    context.route("https://wupp-digitaltwin-assets.cismet.de/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      })
    ),

    // Mock Cesium approximateTerrainHeights.json - returns empty array
    context.route(
      "**/__cesium__/Assets/approximateTerrainHeights.json",
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([]),
        })
    ),

    // Mock Cesium IAU2006_XYS data files - returns empty object
    context.route("**/__cesium__/Assets/IAU2006_XYS/*.json", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({}),
      })
    ),
  ]);
}

/**
 * Mock oblique image services (exterior orientations and footprints)
 * Creates valid mock data for the oblique mode controls to work properly
 */
export async function mockObliqueServices(context: BrowserContext) {
  const BLANK_PNG =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+8V/8AAAAASUVORK5CYII=";

  // WGS84 coordinates near Wuppertal (longitude, latitude)
  // Test URL uses: lat=51.2527066, lng=7.2051585
  const baseLng = 7.2051585;
  const baseLat = 51.2527066;

  // UTM32 coordinates for exterior orientations (EPSG:25832)
  const baseX = 374000;
  const baseY = 5677000;
  const baseZ = 300;

  // Camera IDs mapped to cardinal directions (ORI values)
  // 170 = North (NORD), 171 = East (OST), 174 = South (SUED), 176 = West (WEST)
  const cameraConfig: Record<string, string> = {
    "170": "NORD",
    "171": "OST",
    "174": "SUED",
    "176": "WEST",
  };
  const cameraIds = Object.keys(cameraConfig);

  // Create mock exterior orientations data
  // Format: { "lineIdx_waypointIdx_cameraIdPhotoIdx": [x, y, z, [row0], [row1], [row2]] }
  const mockExteriorOrientations: Record<
    string,
    [
      number,
      number,
      number,
      [number, number, number],
      [number, number, number],
      [number, number, number]
    ]
  > = {};

  // Identity-like rotation matrix (approximately level camera)
  const identityMatrix: [
    [number, number, number],
    [number, number, number],
    [number, number, number]
  ] = [
    [1.0, 0.0, 0.0],
    [0.0, 1.0, 0.0],
    [0.0, 0.0, 1.0],
  ];

  // Create mock images in a small grid
  for (let line = 1; line <= 3; line++) {
    for (let waypoint = 1; waypoint <= 3; waypoint++) {
      for (const cameraId of cameraIds) {
        const paddedLine = String(line).padStart(3, "0");
        const paddedWaypoint = String(waypoint).padStart(3, "0");
        const photoIdx = "001";
        const key = `${paddedLine}_${paddedWaypoint}_${cameraId}${photoIdx}`;

        // Offset UTM32 coordinates slightly for each position
        const x = baseX + (line - 1) * 100;
        const y = baseY + (waypoint - 1) * 100;
        const z = baseZ;

        mockExteriorOrientations[key] = [
          x,
          y,
          z,
          identityMatrix[0],
          identityMatrix[1],
          identityMatrix[2],
        ];
      }
    }
  }

  // Create mock footprints GeoJSON in WGS84 (longitude, latitude)
  // Each footprint polygon corresponds to an image
  const mockFootprints: {
    type: "FeatureCollection";
    features: Array<{
      type: "Feature";
      properties: { FILENAME: string; ORI: string };
      geometry: { type: "Polygon"; coordinates: number[][][] };
    }>;
  } = {
    type: "FeatureCollection",
    features: [],
  };

  // Create footprints for each exterior orientation
  // Use WGS84 coordinates (lng, lat) for GeoJSON
  const halfSize = 0.001; // ~100m in degrees
  let gridIndex = 0;
  for (let line = 1; line <= 3; line++) {
    for (let waypoint = 1; waypoint <= 3; waypoint++) {
      for (const cameraId of cameraIds) {
        const paddedLine = String(line).padStart(3, "0");
        const paddedWaypoint = String(waypoint).padStart(3, "0");
        const photoIdx = "001";
        const key = `${paddedLine}_${paddedWaypoint}_${cameraId}${photoIdx}`;

        // Offset WGS84 coordinates for each grid position
        const lng = baseLng + (line - 1) * 0.001;
        const lat = baseLat + (waypoint - 1) * 0.001;

        mockFootprints.features.push({
          type: "Feature",
          properties: {
            FILENAME: key,
            ORI: cameraConfig[cameraId], // Cardinal direction: NORD, OST, SUED, WEST
          },
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [lng - halfSize, lat - halfSize],
                [lng + halfSize, lat - halfSize],
                [lng + halfSize, lat + halfSize],
                [lng - halfSize, lat + halfSize],
                [lng - halfSize, lat - halfSize],
              ],
            ],
          },
        });
        gridIndex++;
      }
    }
  }

  await Promise.all([
    // Mock exterior orientations endpoint
    context.route(
      "**/wupp-oblique.cismet.de/**/exterior_orientations*.json*",
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mockExteriorOrientations),
        })
    ),

    // Mock footprints GeoJSON endpoint
    context.route("**/wupp-oblique.cismet.de/**/fprfc.geojson*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockFootprints),
      })
    ),

    // Mock oblique image previews with blank PNG
    context.route("**/wupp-oblique.cismet.de/**/*.jpg*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "image/jpeg",
        body: Buffer.from(BLANK_PNG, "base64"),
      })
    ),

    // Mock oblique image previews PNG format
    context.route("**/wupp-oblique.cismet.de/**/*.png*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "image/png",
        body: Buffer.from(BLANK_PNG, "base64"),
      })
    ),
  ]);
}

/**
 * Setup all common image mocks at once
 */
export async function setupAllMocks(
  context: BrowserContext,
  mockedAdressen: any[] = ["bezirke", "quartiere", "pois", "kitas"],
  addresses: any[] = simpleAdressen
) {
  await Promise.all([
    mockWMSImages(context),
    mockRasterTiles(context),
    mockVectorTiles(context),
    mockWMTSTiles(context),
    mockSVGIcons(context),
    mockEmptyDatasets(context, mockedAdressen, addresses),
  ]);
}
