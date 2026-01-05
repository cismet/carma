import { expect, type Page, type Locator } from "@playwright/test";

export const layersNamesArr: LayerName[] = [
  { name: "Kinderspielplätze", tag: "poi_ksp" },
  { name: "Kindertagesstätten", tag: "poi_kita" },
];

export type LayerName = {
  name: string;
  tag: string;
};

export const urlWithMapLayers =
  "/#/?lat=51.2586922&lng=7.1510696&zoom=12&config=847e07f9bee9a4f8&appKey=sharedurl";

export function layerTag(page: Page, name: string): Locator {
  return page.getByRole("button", { name });
}

export async function expectLayerTagsVisible(page: Page, names: LayerName[]) {
  for (const item of names) {
    await expect(layerTag(page, item.name)).toBeVisible();
  }
}

export async function expectLayerTagsNotVisible(
  page: Page,
  names: LayerName[]
) {
  for (const item of names) {
    await expect(layerTag(page, item.name)).not.toBeVisible();
  }
}

export async function expectLayerTagsNotVisibleAfterClick(
  page: Page,
  names: LayerName[]
) {
  for (const item of names) {
    const tagId = "removeLayerButton-wuppPOI:" + item.tag;
    await await page.locator(`[id="${tagId}"]`).click();
    await expect(layerTag(page, item.name)).not.toBeVisible();
  }
}

export async function navigateToMapLayersDialog(
  page: Page,
  navElement: Locator,
  secElement: Locator
) {
  //Check that navElement is visible
  await expect(navElement).toBeVisible();
  //Click on navElement
  await navElement.click();
  await expect(secElement).toBeVisible();
  await secElement.click();
}

export async function loadMapLayerAndCloseDialog(
  page: Page,
  cardTitle: Locator
) {
  await expect(cardTitle).toBeVisible({ timeout: 15000 });
  const loadBtn = page.getByTestId("card-layer-prev").getByRole("button");
  await expect(loadBtn).toBeVisible();
  await loadBtn.click();
  const closeDialogBtn = page.getByRole("dialog").getByRole("button").nth(1);
  await expect(closeDialogBtn).toBeVisible();
  await closeDialogBtn.click();
  await expect(cardTitle).not.toBeVisible();
}

export async function removeMapLayer(page: Page) {
  const detailsBtn = page.getByTestId("card-layer-prev").locator("svg").nth(2);
  await expect(detailsBtn).toBeVisible();
  await detailsBtn.click();
  const infoCard = page.getByTestId("card-layer-detailed-info");
  await expect(infoCard).toBeVisible();
  const removeBtn = page
    .getByTestId("card-layer-detailed-info")
    .getByRole("button", { name: "Löschen" });
  await expect(removeBtn).toBeVisible();
  await removeBtn.click();
  const popUpAlert = page.getByTestId("confirm-delete-collection-dialog");
  await expect(popUpAlert).toBeVisible({ timeout: 15000 });
  const confirmRemoving = page.getByTestId("confirm-delete-collection-submit");
  expect(confirmRemoving).toBeVisible();
  await confirmRemoving.click();
  await expect(popUpAlert).not.toBeVisible({ timeout: 15000 });
  await expect(infoCard).not.toBeVisible({ timeout: 15000 });
}

const mapLayersResponse = {
  backgroundLayer: {
    title: "Stadtplan",
    id: "karte",
    opacity: 1,
    description: "",
    inhalt:
      '<span>Kartendienst (WMS) des Regionalverbandes Ruhr (RVR). Datengrundlage: Stadtkarte 2.0. Wöchentlich in einem automatischen Prozess aktualisierte Zusammenführung des Straßennetzes der OpenStreetMap mit Amtlichen Geobasisdaten des Landes NRW aus den Fachverfahren ALKIS (Gebäude, Flächennutzungen) und ATKIS (Gewässer). © RVR und Kooperationspartner (</span><a class="remove-margins" href="https://www.govdata.de/dl-de/by-2-0">\n                Datenlizenz Deutschland - Namensnennung - Version 2.0\n              </a><span>). Lizenzen der Ausgangsprodukte: </span><a href="https://www.govdata.de/dl-de/zero-2-0">\n                Datenlizenz Deutschland - Zero - Version 2.0\n              </a><span> (Amtliche Geobasisdaten) und </span><a href="https://opendatacommons.org/licenses/odbl/1-0/">    ODbL    </a><span> (OpenStreetMap contributors).</span>',
    eignung:
      "Der Stadtplan ist der am einfachsten und sichersten interpretierbare Kartenhintergrund, weil er an den von Stadtplänen geprägten Sehgewohnheiten von Kartennutzerinnen und -nutzern anschließt. Durch die schrittweise Reduzierung des Karteninhalts bei kleiner werdenden Maßstäben eignet sich der Stadtplan als Hintergrund für beliebige Maßstäbe. Aktualität: der Gebäudebestand ist durch die wöchentliche Ableitung aus dem Liegenschaftskataster sehr aktuell. Gebäude können sicher identifiziert werden, da bei Detailbetrachtungen alle Hausnummern dargestellt werden.",
    visible: true,
    layerType: "wmts",
    props: {
      name: "",
      url: "https://geodaten.metropoleruhr.de/spw2?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=spw2_light&STYLE=default&FORMAT=image/png&TILEMATRIXSET=webmercator_hq&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}",
    },
    layers: "amtlich@90",
    selectedLayerId: "stadtplan",
  },
  layers: [
    {
      title: "Kinderspielplätze 2022",
      id: "wuppPOI:poi_ksp",
      layerType: "vector",
      opacity: 1,
      description:
        "Inhalt: Darstellung der öffentlich zugänglichen Spielflächen und Bolzplätze im Stadtgebiet Wuppertal; Bestandsaufnahme im Jahr 2022.Sichtbarkeit: öffentlich. Nutzung: frei innerhalb der Grenzen des Urheberrechtsgesetzes.",
      conf: {
        blockLegacyGetFeatureInfo: "",
        thumbnail:
          "https://www.wuppertal.de/geoportal/geoportal_vorschau/poi_poi_ksp.png",
        vectorStyle: "https://tiles.cismet.de/kinderspielplatz/style.json",
        infoboxMapping: [
          "header:'Kinderspielplätze'",
          "headerColor:'#C52C6B'",
          "title:p.name",
          "subtitle: 'Fläche: ' + p.flaeche + ' m²'",
          "additionalInfo:p.typ",
        ],
      },
      queryable: true,
      useInFeatureInfo: true,
      visible: true,
      props: {
        style: "https://tiles.cismet.de/kinderspielplatz/style.json",
        minZoom: 9,
        maxZoom: 24,
        legend: [
          {
            Format: "image/png",
            OnlineResource:
              "https://geo.wuppertal.de/geoportal/legenden/default_kinderspielplaetze2022.png",
            size: [231, 418],
          },
        ],
      },
      other: {
        title: "Kinderspielplätze 2022",
        description:
          "Inhalt: Darstellung der öffentlich zugänglichen Spielflächen und Bolzplätze im Stadtgebiet Wuppertal; Bestandsaufnahme im Jahr 2022.Sichtbarkeit: öffentlich. Nutzung: frei innerhalb der Grenzen des Urheberrechtsgesetzes.",
        tags: ["POI"],
        keywords: [
          "carmaconf://infoBoxMapping:header:'Kinderspielplätze'",
          "carmaconf://infoBoxMapping:headerColor:'#C52C6B'",
          "carmaconf://infoBoxMapping:title:p.name",
          "carmaconf://infoBoxMapping:subtitle: 'Fläche: ' + p.flaeche + ' m²'",
          "carmaconf://infoBoxMapping:additionalInfo:p.typ",
          "carmaconf://blockLegacyGetFeatureInfo",
          "carmaConf://thumbnail:https://www.wuppertal.de/geoportal/geoportal_vorschau/poi_poi_ksp.png",
          "carmaConf://vectorStyle:https://tiles.cismet.de/kinderspielplatz/style.json",
          ":vec:",
        ],
        id: "wuppPOI:poi_ksp",
        name: "poi_ksp",
        type: "layer",
        layerType: "wmts",
        queryable: true,
        maxZoom: 24,
        minZoom: 12,
        serviceName: "wuppPOI",
        path: "POI",
        icon: "poi/Kinderspielplätze_2022",
        service: {
          url: "https://maps.wuppertal.de/poi",
          name: "wuppPOI",
        },
        thumbnail:
          "https://www.wuppertal.de/geoportal/geoportal_vorschau/poi_poi_ksp.png",
        layerName: "poi_ksp",
        capabilitiesUrl:
          "https://maps.wuppertal.de/poi?service=WMS&request=GetCapabilities&version=1.1.1",
      },
    },
    {
      title: "Kindertagesstätten",
      id: "wuppPOI:poi_kita",
      layerType: "vector",
      opacity: 1,
      description:
        "Inhalt: Vom Ressort Tageseinrichtungen für Kinder - Jugendamt laufend aktuell gehaltene Standorte vorhandener Tageseinrichtungen für Kinder im Stadtgebiet Wuppertal, anhand der Einrichtungs-Adressen punktförmig digitalisiert auf Basis der Liegenschaftskarte / Amtlichen Basiskarte; individuelle Informationen zur Einrichtung inklusive Link zur Homepage sind über die Sachdatenabfrage verfügbar. Sichtbarkeit: öffentlich. Nutzung: frei innerhalb der Grenzen des Urheberrechtsgesetzes; der zugrunde liegende Datensatz ist unter einer Open-Data-Lizenz (CC BY 4.0) verfügbar.",
      conf: {
        blockLegacyGetFeatureInfo: "",
        thumbnail:
          "https://www.wuppertal.de/geoportal/geoportal_vorschau/poi_poi_kita.png",
        opendata:
          "https://www.offenedaten-wuppertal.de/dataset/kindertageseinrichtungen-wuppertal",
        vectorStyle: "https://tiles.cismet.de/kita/style.json",
        infoboxMapping: [
          "foto: p.foto",
          "header:'Kinderbetreuung'",
          "headerColor:p.schrift",
          "title:p.name",
          "additionalInfo:p.adresse + ', ' + p.traegertyp + ' (' + p.traeger + ')'",
          "subtitle:'Plätze: ' + p.plaetze + ', ' + p.alter + ' Jahre'",
          "url:p.url",
          "tel:p.telefon",
        ],
      },
      queryable: true,
      useInFeatureInfo: true,
      visible: true,
      props: {
        style: "https://tiles.cismet.de/kita/style.json",
        minZoom: 9,
        maxZoom: 24,
        legend: [
          {
            Format: "image/png",
            OnlineResource:
              "https://geo.wuppertal.de/geoportal/legenden/default_poi_kita.png",
            size: [200, 193],
          },
        ],
        metaData: [
          {
            Format: "application/xml",
            OnlineResource:
              "https://apps.geoportal.nrw.de/soapServices/CSWStartup?Service=CSW&Request=GetRecordById&Version=2.0.2&outputSchema=https://www.isotc211.org/2005/gmd&elementSetName=full&id=7840226c-4431-48d2-a4fb-9d5a1d51bda4",
            type: "TC211",
          },
        ],
      },
      other: {
        title: "Kindertagesstätten",
        description:
          "Inhalt: Vom Ressort Tageseinrichtungen für Kinder - Jugendamt laufend aktuell gehaltene Standorte vorhandener Tageseinrichtungen für Kinder im Stadtgebiet Wuppertal, anhand der Einrichtungs-Adressen punktförmig digitalisiert auf Basis der Liegenschaftskarte / Amtlichen Basiskarte; individuelle Informationen zur Einrichtung inklusive Link zur Homepage sind über die Sachdatenabfrage verfügbar. Sichtbarkeit: öffentlich. Nutzung: frei innerhalb der Grenzen des Urheberrechtsgesetzes; der zugrunde liegende Datensatz ist unter einer Open-Data-Lizenz (CC BY 4.0) verfügbar.",
        tags: ["POI"],
        keywords: [
          "carmaconf://infoBoxMapping:foto: p.foto",
          "carmaconf://infoBoxMapping:header:'Kinderbetreuung'",
          "carmaconf://infoBoxMapping:headerColor:p.schrift",
          "carmaconf://infoBoxMapping:title:p.name",
          "carmaconf://infoBoxMapping:additionalInfo:p.adresse + ', ' + p.traegertyp + ' (' + p.traeger + ')'",
          "carmaconf://infoBoxMapping:subtitle:'Plätze: ' + p.plaetze + ', ' + p.alter + ' Jahre'",
          "carmaconf://infoBoxMapping:url:p.url",
          "carmaconf://infoBoxMapping:tel:p.telefon",
          "carmaconf://blockLegacyGetFeatureInfo",
          "carmaConf://thumbnail:https://www.wuppertal.de/geoportal/geoportal_vorschau/poi_poi_kita.png",
          "carmaConf://opendata:https://www.offenedaten-wuppertal.de/dataset/kindertageseinrichtungen-wuppertal",
          "carmaConf://vectorStyle:https://tiles.cismet.de/kita/style.json",
          ":vec:",
        ],
        id: "wuppPOI:poi_kita",
        name: "poi_kita",
        type: "layer",
        layerType: "wmts",
        queryable: true,
        maxZoom: 24,
        minZoom: 11,
        serviceName: "wuppPOI",
        path: "POI",
        icon: "poi/Kindertagesstätten",
        service: {
          url: "https://maps.wuppertal.de/poi",
          name: "wuppPOI",
        },
        thumbnail:
          "https://www.wuppertal.de/geoportal/geoportal_vorschau/poi_poi_kita.png",
        layerName: "poi_kita",
        capabilitiesUrl:
          "https://maps.wuppertal.de/poi?service=WMS&request=GetCapabilities&version=1.1.1",
      },
    },
  ],
  view: {
    center: ["51.2586922", "7.1510696"],
    zoom: "12",
  },
  selection: null,
};

const playgroundStyleJson = {
  version: 8,
  sources: {
    "kinderspielplatz-source": {
      type: "vector",
      tiles: ["https://tiles.cismet.de/kinderspielplatz/{z}/{x}/{y}.pbf"],
      minzoom: 9,
      maxzoom: 14,
    },
  },
  glyphs: "https://tiles.cismet.de/fonts/{fontstack}/{range}.pbf",
  sprite: "https://tiles.cismet.de/kinderspielplatz/sprites",
  layers: [
    {
      id: "kinderspielplatz-line-id",
      type: "line",
      source: "kinderspielplatz-source",
      "source-layer": "kinderspielplatz",
      minzoom: 15,
      maxzoom: 22,
      layout: {
        "line-join": "round",
        "line-cap": "round",
      },
      paint: {
        "line-color": "#FFFFFF",
        "line-opacity": 1,
        "line-width": 2,
      },
    },
    {
      id: "kinderspielplatz-fill-id",
      type: "fill",
      source: "kinderspielplatz-source",
      "source-layer": "kinderspielplatz",
      minzoom: 15,
      maxzoom: 22,
      paint: {
        "fill-color": "#17651F",
        "fill-opacity": 0.7,
      },
    },
    {
      id: "selection",
      type: "symbol",
      source: "kinderspielplatz-source",
      "source-layer": "kinderspielplatz",
      minzoom: 9,
      maxzoom: 24,
      layout: {
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
        "icon-size": {
          stops: [
            [9, 0.32],
            [24, 1],
          ],
        },
        "icon-padding": 0,
        "icon-image": "Icon_Full",
      },
      paint: {
        "icon-opacity": [
          "case",
          ["boolean", ["feature-state", "selected"], false],
          1,
          0,
        ],
      },
    },
    {
      id: "line-id-selection",
      type: "line",
      source: "kinderspielplatz-source",
      "source-layer": "kinderspielplatz",
      minzoom: 0,
      maxzoom: 22,
      layout: {
        "line-join": "round",
        "line-cap": "round",
      },
      paint: {
        "line-color": "#3A7CEB",
        "line-opacity": [
          "case",
          ["boolean", ["feature-state", "selected"], false],
          1,
          0,
        ],
        "line-width": 3,
      },
    },
    {
      id: "kinderspielplatz-dots",
      type: "circle",
      source: "kinderspielplatz-source",
      "source-layer": "kinderspielplatz",
      minzoom: 0,
      maxzoom: 24,
      filter: ["==", ["get", "geometrie_typ"], "Spielpunkt"],
      layout: {
        visibility: "visible",
      },
      paint: {
        "circle-radius": {
          base: 2.75,
          stops: [
            [0, 5],
            [16, 10],
            [24, 30],
          ],
        },
        "circle-color": "#C52C6B",
        "circle-stroke-color": "#EEEEEE",
        "circle-stroke-width": 4,
      },
    },
    {
      id: "kinderspielplatz-icon-id",
      type: "symbol",
      source: "kinderspielplatz-source",
      "source-layer": "kinderspielplatz",
      minzoom: 9,
      maxzoom: 24,
      filter: ["!=", ["get", "geometrie_typ"], "Spielpunkt"],
      layout: {
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
        "icon-size": {
          stops: [
            [9, 0.32],
            [24, 0.8],
          ],
        },
        "icon-padding": 0,
        "icon-image": ["get", "signatur"],
      },
      paint: {
        "icon-opacity": 1,
      },
    },
    {
      id: "text",
      type: "symbol",
      source: "kinderspielplatz-source",
      "source-layer": "kinderspielplatz",
      minzoom: 16,
      maxzoom: 24,
      filter: ["!=", ["get", "geometrie_typ"], "Spielpunkt"],
      layout: {
        "text-field": ["get", "name"],
        "text-size": 12,
        "text-font": ["Open Sans Semibold"],
        "text-offset": {
          stops: [
            [17, [0, 1.3]],
            [24, [0, 2]],
          ],
        },
        "text-anchor": "top",
        "text-allow-overlap": true,
        "text-rotation-alignment": "viewport",
      },
      paint: {
        "text-color": "#C52C6B",
        "text-halo-color": "#FFFFFF",
        "text-halo-width": 5,
        "text-opacity": 1,
      },
    },
  ],
};

const kitaStyleJson = {
  version: 8,
  sources: {
    "kita-source": {
      type: "vector",
      tiles: ["https://tiles.cismet.de/kita/{z}/{x}/{y}.pbf"],
      minzoom: 9,
      maxzoom: 14,
    },
  },
  sprite: "https://tiles.cismet.de/kita/sprites",
  glyphs: "https://tiles.cismet.de/fonts/{fontstack}/{range}.pbf",
  layers: [
    {
      id: "selection",
      type: "symbol",
      source: "kita-source",
      "source-layer": "kita",
      minzoom: 9,
      maxzoom: 24,
      layout: {
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
        "icon-size": {
          stops: [
            [9, 0.32],
            [24, 1],
          ],
        },
        "icon-padding": 0,
        "icon-image": "Icon_Full",
      },
      paint: {
        "icon-opacity": [
          "case",
          ["boolean", ["feature-state", "selected"], false],
          1,
          0,
        ],
      },
    },
    {
      id: "icon",
      type: "symbol",
      source: "kita-source",
      "source-layer": "kita",
      minzoom: 9,
      maxzoom: 24,
      layout: {
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
        "icon-size": {
          stops: [
            [9, 0.32],
            [24, 0.8],
          ],
        },
        "icon-padding": 0,
        "icon-image": "kita",
      },
    },
    {
      id: "text",
      type: "symbol",
      source: "kita-source",
      "source-layer": "kita",
      minzoom: 16,
      maxzoom: 24,
      layout: {
        "text-field": ["get", "name"],
        "text-size": 12,
        "text-font": ["Open Sans Semibold"],
        "text-offset": {
          stops: [
            [17, [0, 1.3]],
            [24, [0, 2]],
          ],
        },
        "text-anchor": "top",
        "text-allow-overlap": true,
        "text-rotation-alignment": "viewport",
      },
      paint: {
        "text-color": "#00A0B0",
        "text-halo-color": "#FFFFFF",
        "text-halo-width": 5,
        "text-opacity": 1,
      },
    },
  ],
};

const playgroundSpritesJson = {
  Icon_Full: {
    height: 66,
    pixelRatio: 1,
    width: 66,
    x: 0,
    y: 0,
  },
  bolzplatz: {
    height: 50,
    pixelRatio: 1,
    width: 50,
    x: 66,
    y: 0,
  },
  dirtbike: {
    height: 50,
    pixelRatio: 1,
    width: 50,
    x: 0,
    y: 66,
  },
  parkour: {
    height: 50,
    pixelRatio: 1,
    width: 50,
    x: 50,
    y: 66,
  },
  skateboardanlage: {
    height: 50,
    pixelRatio: 1,
    width: 50,
    x: 100,
    y: 66,
  },
  spielplatz: {
    height: 50,
    pixelRatio: 1,
    width: 50,
    x: 150,
    y: 66,
  },
  spielpunkt: {
    height: 50,
    pixelRatio: 1,
    width: 50,
    x: 200,
    y: 66,
  },
  sportanlage: {
    height: 50,
    pixelRatio: 1,
    width: 50,
    x: 116,
    y: 0,
  },
};
const kitaSpritesJson = {
  Icon_Full: {
    height: 66,
    pixelRatio: 1,
    width: 66,
    x: 0,
    y: 0,
  },
  kita: {
    height: 50,
    pixelRatio: 1,
    width: 50,
    x: 66,
    y: 0,
  },
};

export async function setupCommonLayerMocks(page: Page) {
  await page.route(
    "https://ceepr.cismet.de/config/wuppertal/_dev_geoportal/847e07f9bee9a4f8",
    async (route) => {
      await route.fulfill({ json: mapLayersResponse });
    }
  );
  await page.route(
    "https://tiles.cismet.de/kinderspielplatz/style.json",
    async (route) => {
      await route.fulfill({ json: playgroundStyleJson });
    }
  );
  await page.route("https://tiles.cismet.de/kita/style.json", async (route) => {
    await route.fulfill({ json: kitaStyleJson });
  });
  await page.route(
    "https://tiles.cismet.de/kinderspielplatz/sprites.json",
    async (route) => {
      await route.fulfill({ json: playgroundSpritesJson });
    }
  );
  await page.route(
    "https://tiles.cismet.de/kita/sprites.json",
    async (route) => {
      await route.fulfill({ json: kitaSpritesJson });
    }
  );
}

export async function setupSaveMapToFavoriteMocks(page: Page) {
  await setupCommonLayerMocks(page);

  await page.route(
    "https://wunda-cloud-api.cismet.de/actions/WUNDA_BLAU.dataAquisition/tasks?resultingInstanceType=result",
    async (route) => {
      await route.fulfill({
        json: {
          contentType: "application/octet-stream",
          res: '{"md5":"81b7659b7b8d33a390fa669f5d882c38","content":"[{\\"id\\" : 1, \\"name\\" : \\"Interessante Orte\\", \\"config\\" : \\"{\\\\\\"description\\\\\\":\\\\\\"Inhalt: Inhalt für Interessante Orte Verwendungszweck: Verwendungszweck für Interessante Orte\\\\\\",\\\\\\"title\\\\\\":\\\\\\"Interessante Orte\\\\\\",\\\\\\"type\\\\\\":\\\\\\"collection\\\\\\",\\\\\\"thumbnail\\\\\\":\\\\\\"\\\\\\",\\\\\\"path\\\\\\":\\\\\\"POI\\\\\\",\\\\\\"backgroundLayer\\\\\\":{\\\\\\"title\\\\\\":\\\\\\"Stadtplan\\\\\\",\\\\\\"id\\\\\\":\\\\\\"karte\\\\\\",\\\\\\"opacity\\\\\\":1,\\\\\\"description\\\\\\":\\\\\\"\\\\\\",\\\\\\"inhalt\\\\\\":\\\\\\"<span>Kartendienst (WMS) des Regionalverbandes Ruhr (RVR). Datengrundlage: Stadtkarte 2.0. Wöchentlich in einem automatischen Prozess aktualisierte Zusammenführung des Straßennetzes der OpenStreetMap mit Amtlichen Geobasisdaten des Landes NRW aus den Fachverfahren ALKIS (Gebäude, Flächennutzungen) und ATKIS (Gewässer). © RVR und Kooperationspartner (</span><a class=\\\\\\\\\\\\\\"remove-margins\\\\\\\\\\\\\\" href=\\\\\\\\\\\\\\"https://www.govdata.de/dl-de/by-2-0\\\\\\\\\\\\\\">\\\\\\\\n                Datenlizenz Deutschland - Namensnennung - Version 2.0\\\\\\\\n              </a><span>). Lizenzen der Ausgangsprodukte: </span><a href=\\\\\\\\\\\\\\"https://www.govdata.de/dl-de/zero-2-0\\\\\\\\\\\\\\">\\\\\\\\n                Datenlizenz Deutschland - Zero - Version 2.0\\\\\\\\n              </a><span> (Amtliche Geobasisdaten) und </span><a href=\\\\\\\\\\\\\\"https://opendatacommons.org/licenses/odbl/1-0/\\\\\\\\\\\\\\">    ODbL    </a><span> (OpenStreetMap contributors).</span>\\\\\\",\\\\\\"eignung\\\\\\":\\\\\\"Der Stadtplan ist der am einfachsten und sichersten interpretierbare Kartenhintergrund, weil er an den von Stadtplänen geprägten Sehgewohnheiten von Kartennutzerinnen und -nutzern anschließt. Durch die schrittweise Reduzierung des Karteninhalts bei kleiner werdenden Maßstäben eignet sich der Stadtplan als Hintergrund für beliebige Maßstäbe. Aktualität: der Gebäudebestand ist durch die wöchentliche Ableitung aus dem Liegenschaftskataster sehr aktuell. Gebäude können sicher identifiziert werden, da bei Detailbetrachtungen alle Hausnummern dargestellt werden.\\\\\\",\\\\\\"visible\\\\\\":true,\\\\\\"layerType\\\\\\":\\\\\\"wmts\\\\\\",\\\\\\"props\\\\\\":{\\\\\\"name\\\\\\":\\\\\\"\\\\\\",\\\\\\"url\\\\\\":\\\\\\"https://geodaten.metropoleruhr.de/spw2?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=spw2_light&STYLE=default&FORMAT=image/png&TILEMATRIXSET=webmercator_hq&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}\\\\\\"},\\\\\\"layers\\\\\\":\\\\\\"amtlich@90\\\\\\"},\\\\\\"layers\\\\\\":[{\\\\\\"title\\\\\\":\\\\\\"Interessante Orte\\\\\\",\\\\\\"id\\\\\\":\\\\\\"wuppPOI:poi\\\\\\",\\\\\\"layerType\\\\\\":\\\\\\"vector\\\\\\",\\\\\\"opacity\\\\\\":1,\\\\\\"description\\\\\\":\\\\\\"Inhalt: Ursprünglich aus Kartenproduktionen der Stadt Wuppertal abgeleitete nunmehr fortlaufend aktualisierte und kategorisierte interessante Orte (Points of Interest) im Wuppertaler Stadtgebiet oder dessen Nähe, punktförmig digitalisiert auf Basis der Amtlichen Stadtkarte (Entwurfsmaßstab 1:15000); individuelle Informationen zu den POI sind über die Sachdatenabfrage verfügbar; ausgeprägt werden alle POI. Sichtbarkeit: öffentlich. Nutzung: frei innerhalb der Grenzen des Urheberrechtsgesetzes.\\\\\\",\\\\\\"conf\\\\\\":{\\\\\\"thumbnail\\\\\\":\\\\\\"https://www.wuppertal.de/geoportal/geoportal_vorschau/poi_poi.png\\\\\\",\\\\\\"opendata\\\\\\":\\\\\\"https://www.offenedaten-wuppertal.de/dataset/interessante-orte-poi-wuppertal\\\\\\",\\\\\\"vectorStyle\\\\\\":\\\\\\"https://tiles.cismet.de/poi/style.json\\\\\\",\\\\\\"infoboxMapping\\\\\\":[\\\\\\"foto: p.foto\\\\\\",\\\\\\"headerColor:p.schrift\\\\\\",\\\\\\"header:p.kombi\\\\\\",\\\\\\"title:p.geographicidentifier\\\\\\",\\\\\\"additionalInfo:p.adresse\\\\\\",\\\\\\"subtitle: p.info\\\\\\",\\\\\\"url:p.url\\\\\\",\\\\\\"tel:p.telefon\\\\\\",\\\\\\"email:p.email\\\\\\"]},\\\\\\"queryable\\\\\\":true,\\\\\\"useInFeatureInfo\\\\\\":true,\\\\\\"visible\\\\\\":true,\\\\\\"props\\\\\\":{\\\\\\"style\\\\\\":\\\\\\"https://tiles.cismet.de/poi/style.json\\\\\\",\\\\\\"minZoom\\\\\\":9,\\\\\\"maxZoom\\\\\\":24,\\\\\\"legend\\\\\\":[{\\\\\\"Format\\\\\\":\\\\\\"image/png\\\\\\",\\\\\\"OnlineResource\\\\\\":\\\\\\"https://www.wuppertal.de/geoportal/legenden/default_poi_farbig.png\\\\\\",\\\\\\"size\\\\\\":[200,1362]}],\\\\\\"metaData\\\\\\":[{\\\\\\"Format\\\\\\":\\\\\\"application/xml\\\\\\",\\\\\\"OnlineResource\\\\\\":\\\\\\"https://apps.geoportal.nrw.de/soapServices/CSWStartup?Service=CSW&Request=GetRecordById&Version=2.0.2&outputSchema=https://www.isotc211.org/2005/gmd&elementSetName=full&id=21974e97-e906-4996-9397-e505f94ad8f5\\\\\\",\\\\\\"type\\\\\\":\\\\\\"TC211\\\\\\"}]},\\\\\\"other\\\\\\":{\\\\\\"title\\\\\\":\\\\\\"Interessante Orte\\\\\\",\\\\\\"description\\\\\\":\\\\\\"Inhalt: Ursprünglich aus Kartenproduktionen der Stadt Wuppertal abgeleitete nunmehr fortlaufend aktualisierte und kategorisierte interessante Orte (Points of Interest) im Wuppertaler Stadtgebiet oder dessen Nähe, punktförmig digitalisiert auf Basis der Amtlichen Stadtkarte (Entwurfsmaßstab 1:15000); individuelle Informationen zu den POI sind über die Sachdatenabfrage verfügbar; ausgeprägt werden alle POI. Sichtbarkeit: öffentlich. Nutzung: frei innerhalb der Grenzen des Urheberrechtsgesetzes.\\\\\\",\\\\\\"tags\\\\\\":[\\\\\\"POI\\\\\\"],\\\\\\"keywords\\\\\\":[\\\\\\"carmaconf://infoBoxMapping:foto: p.foto\\\\\\",\\\\\\"carmaconf://infoBoxMapping:headerColor:p.schrift\\\\\\",\\\\\\"carmaconf://infoBoxMapping:header:p.kombi\\\\\\",\\\\\\"carmaconf://infoBoxMapping:title:p.geographicidentifier\\\\\\",\\\\\\"carmaconf://infoBoxMapping:additionalInfo:p.adresse\\\\\\",\\\\\\"carmaconf://infoBoxMapping:subtitle: p.info\\\\\\",\\\\\\"carmaconf://infoBoxMapping:url:p.url\\\\\\",\\\\\\"carmaconf://infoBoxMapping:tel:p.telefon\\\\\\",\\\\\\"carmaconf://infoBoxMapping:email:p.email\\\\\\",\\\\\\"carmaConf://thumbnail:https://www.wuppertal.de/geoportal/geoportal_vorschau/poi_poi.png\\\\\\",\\\\\\"carmaConf://opendata:https://www.offenedaten-wuppertal.de/dataset/interessante-orte-poi-wuppertal\\\\\\",\\\\\\"carmaConf://vectorStyle:https://tiles.cismet.de/poi/style.json\\\\\\",\\\\\\":vec:\\\\\\"],\\\\\\"id\\\\\\":\\\\\\"wuppPOI:poi\\\\\\",\\\\\\"name\\\\\\":\\\\\\"poi\\\\\\",\\\\\\"type\\\\\\":\\\\\\"layer\\\\\\",\\\\\\"layerType\\\\\\":\\\\\\"wmts\\\\\\",\\\\\\"queryable\\\\\\":true,\\\\\\"maxZoom\\\\\\":24,\\\\\\"minZoom\\\\\\":11,\\\\\\"serviceName\\\\\\":\\\\\\"wuppPOI\\\\\\",\\\\\\"path\\\\\\":\\\\\\"POI\\\\\\",\\\\\\"icon\\\\\\":\\\\\\"poi/alle_interessanten_Orte\\\\\\",\\\\\\"service\\\\\\":{\\\\\\"url\\\\\\":\\\\\\"https://maps.wuppertal.de/poi\\\\\\",\\\\\\"name\\\\\\":\\\\\\"wuppPOI\\\\\\"},\\\\\\"thumbnail\\\\\\":\\\\\\"https://www.wuppertal.de/geoportal/geoportal_vorschau/poi_poi.png\\\\\\",\\\\\\"layerName\\\\\\":\\\\\\"poi\\\\\\",\\\\\\"capabilitiesUrl\\\\\\":\\\\\\"https://maps.wuppertal.de/poi?service=WMS&request=GetCapabilities&version=1.1.1\\\\\\"}}]}\\", \\"draft\\" : null}, {\\"id\\" : 2, \\"name\\" : \\"Leuchtende Orte\\", \\"config\\" : \\"{\\\\\\"description\\\\\\":\\\\\\"Inhalt: Leuchten und Interessante Orte Verwendungszweck: Auch hier Verwendungszweck\\\\\\",\\\\\\"title\\\\\\":\\\\\\"Leuchtende Orte\\\\\\",\\\\\\"type\\\\\\":\\\\\\"collection\\\\\\",\\\\\\"thumbnail\\\\\\":\\\\\\"\\\\\\",\\\\\\"path\\\\\\":\\\\\\"Infrastruktur\\\\\\",\\\\\\"backgroundLayer\\\\\\":{\\\\\\"id\\\\\\":\\\\\\"luftbild\\\\\\",\\\\\\"title\\\\\\":\\\\\\"Luftbildkarte 06/21\\\\\\",\\\\\\"opacity\\\\\\":1,\\\\\\"description\\\\\\":\\\\\\"Luftbildkarte (aus True Orthofoto 06/21) © Geobasis NRW  / RVR und Kooperationspartner\\\\\\",\\\\\\"inhalt\\\\\\":\\\\\\"<span>(1) Kartendienst (WMS) des Landes NRW, gehostet von IT.NRW. Datengrundlage: True Orthofoto weit überwiegend aus Bildflügen vom 01. und 02. Juni 2021, durchgeführt im Auftrag von Geobasis NRW durch MGGP AERO Sp. z o.o./Krakau, Bodenauflösung 10 cm. In Teilen von Nächstebreck-Ost, Beyenburg-Mitte und Herbringhausen Bildflug vom 30. März 2021, durchgeführt durch Aerowest GmbH/Dortmund. (True Orthofoto: Aus Luftbildern mit hoher Längs- und Querüberdeckung in einem automatisierten Bildverarbeitungsprozess berechnetes Bild in Parallelprojektion, also ohne Gebäudeverkippung und sichttote Bereiche.) © Geobasis NRW (</span>\\\\\\\\n              <a class=\\\\\\\\\\\\\\"remove-margins\\\\\\\\\\\\\\" href=\\\\\\\\\\\\\\"https://www.govdata.de/dl-de/zero-2-0\\\\\\\\\\\\\\">dl-zero-de/2.0</a>\\\\\\\\n              <span>). (2) Kartendienste (WMS) des Regionalverbandes Ruhr (RVR). Datengrundlagen: Stadtkarte 2.0 und Kartenschrift aus der Stadtkarte 2.0. Details s. Hintergrundkarte Stadtplan).</span>\\\\\\",\\\\\\"eignung\\\\\\":\\\\\\"Luftbildkarten eignen sich wegen ihrer Anschaulichkeit und ihres Inhaltsreichtums vor allem für Detailbetrachtungen. Durch die Verwendung eines \\\\\\\\\\\\\\"True Orthofotos\\\\\\\\\\\\\\" ist die passgenaue Überlagerung mit grundrisstreuen Kartenebenen möglich. Die Luftbildkarte 06/21 basiert auf einer vom Land NRW (Geobasis NRW) beauftragten Befliegung bei voller Belaubung (Sommerbefliegung). Die Straßenbereiche sind daher nicht vollständig sichtbar, während die Grünbereiche anschaulich und gut zu interpretieren sind. Aktualität: Geobasis NRW lässt in einem Turnus von 4 Jahren solche Sommerbildflüge durchführen. Die dargestellte Situation, z. B. bezüglich des Gebäudebestandes, kann daher bis zu 4,5 Jahre alt sein.\\\\\\",\\\\\\"layerType\\\\\\":\\\\\\"wmts\\\\\\",\\\\\\"visible\\\\\\":true,\\\\\\"props\\\\\\":{\\\\\\"name\\\\\\":\\\\\\"\\\\\\",\\\\\\"url\\\\\\":\\\\\\"https://maps.wuppertal.de/karten?service=WMS&request=GetMap&layers=R102%3Aluftbild2022\\\\\\"},\\\\\\"layers\\\\\\":\\\\\\"rvrGrundriss@100|trueOrtho2021@75|rvrSchriftNT@100\\\\\\"},\\\\\\"layers\\\\\\":[{\\\\\\"title\\\\\\":\\\\\\"Leuchten\\\\\\",\\\\\\"id\\\\\\":\\\\\\"wuppInfra:belis_Masten\\\\\\",\\\\\\"layerType\\\\\\":\\\\\\"vector\\\\\\",\\\\\\"opacity\\\\\\":0.3,\\\\\\"description\\\\\\":\\\\\\"Inhalt: Fortlaufend aktualisierte von der Stadt Wuppertal betriebene und / oder unterhaltene Objekte der öffentlichen Beleuchtung (Masten oder Leuchten) aus dem (Straßen-) Beleuchtungsinformationssystem Belis; regelmäßiger Revisionsprozess stellt sicher, dass neue Objekte spätestens nach 3 Monaten im Belis-Datenbestand enthalten sind; Standorte neuer Objekte werden zunächst mit einer Lagegenauigkeit von einigen [m] frei digitalisiert, später wird die Standortkoordinate durch Einmessung oder Digitalisierung im kommunalen Orthofoto auf eine Lagegenauigkeit von einigen [dm] verbessert. Sichtbarkeit: öffentlich. Nutzung: frei innerhalb der Grenzen des Urheberrechtsgesetzes.\\\\\\",\\\\\\"conf\\\\\\":{\\\\\\"thumbnail\\\\\\":\\\\\\"https://www.wuppertal.de/geoportal/geoportal_vorschau/infra_belis_Masten.png\\\\\\",\\\\\\"vectorStyle\\\\\\":\\\\\\"https://tiles.cismet.de/leuchten/style.json\\\\\\",\\\\\\"infoboxMapping\\\\\\":[]},\\\\\\"queryable\\\\\\":false,\\\\\\"useInFeatureInfo\\\\\\":true,\\\\\\"visible\\\\\\":true,\\\\\\"props\\\\\\":{\\\\\\"style\\\\\\":\\\\\\"https://tiles.cismet.de/leuchten/style.json\\\\\\",\\\\\\"minZoom\\\\\\":9,\\\\\\"maxZoom\\\\\\":24,\\\\\\"legend\\\\\\":[{\\\\\\"Format\\\\\\":\\\\\\"image/png\\\\\\",\\\\\\"OnlineResource\\\\\\":\\\\\\"https://www.wuppertal.de/geoportal/legenden/default_beleuchtung_leuchte_kreis.png\\\\\\",\\\\\\"size\\\\\\":[230,181]}]},\\\\\\"other\\\\\\":{\\\\\\"title\\\\\\":\\\\\\"Leuchten\\\\\\",\\\\\\"description\\\\\\":\\\\\\"Inhalt: Fortlaufend aktualisierte von der Stadt Wuppertal betriebene und / oder unterhaltene Objekte der öffentlichen Beleuchtung (Masten oder Leuchten) aus dem (Straßen-) Beleuchtungsinformationssystem Belis; regelmäßiger Revisionsprozess stellt sicher, dass neue Objekte spätestens nach 3 Monaten im Belis-Datenbestand enthalten sind; Standorte neuer Objekte werden zunächst mit einer Lagegenauigkeit von einigen [m] frei digitalisiert, später wird die Standortkoordinate durch Einmessung oder Digitalisierung im kommunalen Orthofoto auf eine Lagegenauigkeit von einigen [dm] verbessert. Sichtbarkeit: öffentlich. Nutzung: frei innerhalb der Grenzen des Urheberrechtsgesetzes.\\\\\\",\\\\\\"tags\\\\\\":[\\\\\\"Infrastruktur\\\\\\",\\\\\\"Öffentliche Beleuchtung\\\\\\"],\\\\\\"keywords\\\\\\":[\\\\\\"carmaConf://thumbnail:https://www.wuppertal.de/geoportal/geoportal_vorschau/infra_belis_Masten.png\\\\\\",\\\\\\"carmaConf://vectorStyle:https://tiles.cismet.de/leuchten/style.json\\\\\\",\\\\\\":vec:\\\\\\"],\\\\\\"id\\\\\\":\\\\\\"wuppInfra:belis_Masten\\\\\\",\\\\\\"name\\\\\\":\\\\\\"belis_Masten\\\\\\",\\\\\\"type\\\\\\":\\\\\\"layer\\\\\\",\\\\\\"layerType\\\\\\":\\\\\\"wmts\\\\\\",\\\\\\"queryable\\\\\\":false,\\\\\\"maxZoom\\\\\\":24,\\\\\\"minZoom\\\\\\":15,\\\\\\"serviceName\\\\\\":\\\\\\"wuppInfra\\\\\\",\\\\\\"path\\\\\\":\\\\\\"Infrastruktur\\\\\\",\\\\\\"icon\\\\\\":\\\\\\"infra/Leuchten\\\\\\",\\\\\\"service\\\\\\":{\\\\\\"url\\\\\\":\\\\\\"https://maps.wuppertal.de/infra\\\\\\",\\\\\\"name\\\\\\":\\\\\\"wuppInfra\\\\\\"},\\\\\\"thumbnail\\\\\\":\\\\\\"https://www.wuppertal.de/geoportal/geoportal_vorschau/infra_belis_Masten.png\\\\\\",\\\\\\"layerName\\\\\\":\\\\\\"belis_Masten\\\\\\",\\\\\\"capabilitiesUrl\\\\\\":\\\\\\"https://maps.wuppertal.de/infra?service=WMS&request=GetCapabilities&version=1.1.1\\\\\\"}},{\\\\\\"title\\\\\\":\\\\\\"Interessante Orte\\\\\\",\\\\\\"id\\\\\\":\\\\\\"wuppPOI:poi\\\\\\",\\\\\\"layerType\\\\\\":\\\\\\"vector\\\\\\",\\\\\\"opacity\\\\\\":1,\\\\\\"description\\\\\\":\\\\\\"Inhalt: Ursprünglich aus Kartenproduktionen der Stadt Wuppertal abgeleitete nunmehr fortlaufend aktualisierte und kategorisierte interessante Orte (Points of Interest) im Wuppertaler Stadtgebiet oder dessen Nähe, punktförmig digitalisiert auf Basis der Amtlichen Stadtkarte (Entwurfsmaßstab 1:15000); individuelle Informationen zu den POI sind über die Sachdatenabfrage verfügbar; ausgeprägt werden alle POI. Sichtbarkeit: öffentlich. Nutzung: frei innerhalb der Grenzen des Urheberrechtsgesetzes.\\\\\\",\\\\\\"conf\\\\\\":{\\\\\\"thumbnail\\\\\\":\\\\\\"https://www.wuppertal.de/geoportal/geoportal_vorschau/poi_poi.png\\\\\\",\\\\\\"opendata\\\\\\":\\\\\\"https://www.offenedaten-wuppertal.de/dataset/interessante-orte-poi-wuppertal\\\\\\",\\\\\\"vectorStyle\\\\\\":\\\\\\"https://tiles.cismet.de/poi/style.json\\\\\\",\\\\\\"infoboxMapping\\\\\\":[\\\\\\"foto: p.foto\\\\\\",\\\\\\"headerColor:p.schrift\\\\\\",\\\\\\"header:p.kombi\\\\\\",\\\\\\"title:p.geographicidentifier\\\\\\",\\\\\\"additionalInfo:p.adresse\\\\\\",\\\\\\"subtitle: p.info\\\\\\",\\\\\\"url:p.url\\\\\\",\\\\\\"tel:p.telefon\\\\\\",\\\\\\"email:p.email\\\\\\"]},\\\\\\"queryable\\\\\\":true,\\\\\\"useInFeatureInfo\\\\\\":true,\\\\\\"visible\\\\\\":true,\\\\\\"props\\\\\\":{\\\\\\"style\\\\\\":\\\\\\"https://tiles.cismet.de/poi/style.json\\\\\\",\\\\\\"minZoom\\\\\\":9,\\\\\\"maxZoom\\\\\\":24,\\\\\\"legend\\\\\\":[{\\\\\\"Format\\\\\\":\\\\\\"image/png\\\\\\",\\\\\\"OnlineResource\\\\\\":\\\\\\"https://www.wuppertal.de/geoportal/legenden/default_poi_farbig.png\\\\\\",\\\\\\"size\\\\\\":[200,1362]}],\\\\\\"metaData\\\\\\":[{\\\\\\"Format\\\\\\":\\\\\\"application/xml\\\\\\",\\\\\\"OnlineResource\\\\\\":\\\\\\"https://apps.geoportal.nrw.de/soapServices/CSWStartup?Service=CSW&Request=GetRecordById&Version=2.0.2&outputSchema=https://www.isotc211.org/2005/gmd&elementSetName=full&id=21974e97-e906-4996-9397-e505f94ad8f5\\\\\\",\\\\\\"type\\\\\\":\\\\\\"TC211\\\\\\"}]},\\\\\\"other\\\\\\":{\\\\\\"title\\\\\\":\\\\\\"Interessante Orte\\\\\\",\\\\\\"description\\\\\\":\\\\\\"Inhalt: Ursprünglich aus Kartenproduktionen der Stadt Wuppertal abgeleitete nunmehr fortlaufend aktualisierte und kategorisierte interessante Orte (Points of Interest) im Wuppertaler Stadtgebiet oder dessen Nähe, punktförmig digitalisiert auf Basis der Amtlichen Stadtkarte (Entwurfsmaßstab 1:15000); individuelle Informationen zu den POI sind über die Sachdatenabfrage verfügbar; ausgeprägt werden alle POI. Sichtbarkeit: öffentlich. Nutzung: frei innerhalb der Grenzen des Urheberrechtsgesetzes.\\\\\\",\\\\\\"tags\\\\\\":[\\\\\\"POI\\\\\\"],\\\\\\"keywords\\\\\\":[\\\\\\"carmaconf://infoBoxMapping:foto: p.foto\\\\\\",\\\\\\"carmaconf://infoBoxMapping:headerColor:p.schrift\\\\\\",\\\\\\"carmaconf://infoBoxMapping:header:p.kombi\\\\\\",\\\\\\"carmaconf://infoBoxMapping:title:p.geographicidentifier\\\\\\",\\\\\\"carmaconf://infoBoxMapping:additionalInfo:p.adresse\\\\\\",\\\\\\"carmaconf://infoBoxMapping:subtitle: p.info\\\\\\",\\\\\\"carmaconf://infoBoxMapping:url:p.url\\\\\\",\\\\\\"carmaconf://infoBoxMapping:tel:p.telefon\\\\\\",\\\\\\"carmaconf://infoBoxMapping:email:p.email\\\\\\",\\\\\\"carmaConf://thumbnail:https://www.wuppertal.de/geoportal/geoportal_vorschau/poi_poi.png\\\\\\",\\\\\\"carmaConf://opendata:https://www.offenedaten-wuppertal.de/dataset/interessante-orte-poi-wuppertal\\\\\\",\\\\\\"carmaConf://vectorStyle:https://tiles.cismet.de/poi/style.json\\\\\\",\\\\\\":vec:\\\\\\"],\\\\\\"id\\\\\\":\\\\\\"wuppPOI:poi\\\\\\",\\\\\\"name\\\\\\":\\\\\\"poi\\\\\\",\\\\\\"type\\\\\\":\\\\\\"layer\\\\\\",\\\\\\"layerType\\\\\\":\\\\\\"wmts\\\\\\",\\\\\\"queryable\\\\\\":true,\\\\\\"maxZoom\\\\\\":24,\\\\\\"minZoom\\\\\\":11,\\\\\\"serviceName\\\\\\":\\\\\\"wuppPOI\\\\\\",\\\\\\"path\\\\\\":\\\\\\"POI\\\\\\",\\\\\\"icon\\\\\\":\\\\\\"poi/alle_interessanten_Orte\\\\\\",\\\\\\"service\\\\\\":{\\\\\\"url\\\\\\":\\\\\\"https://maps.wuppertal.de/poi\\\\\\",\\\\\\"name\\\\\\":\\\\\\"wuppPOI\\\\\\"},\\\\\\"thumbnail\\\\\\":\\\\\\"https://www.wuppertal.de/geoportal/geoportal_vorschau/poi_poi.png\\\\\\",\\\\\\"layerName\\\\\\":\\\\\\"poi\\\\\\",\\\\\\"capabilitiesUrl\\\\\\":\\\\\\"https://maps.wuppertal.de/poi?service=WMS&request=GetCapabilities&version=1.1.1\\\\\\"}}]}\\", \\"draft\\" : null}, {\\"id\\" : 3, \\"name\\" : \\"Kinderkarte\\", \\"config\\" : \\"{\\\\\\"description\\\\\\":\\\\\\"Inhalt: Spielplätze, Kindertageseinrichtungen und Grundschulen aus dem POI-Datenbestand der Stadt Wuppertal mit der Amtlichen Stadtkarte als Hintergrund.\\\\\\\\n\\\\\\\\nVerwendungszweck: Information für Eltern von Kindern bis zum Grundschulalter über relevante Betreuungs-, Bildungs- und Spieleinrichtungen.\\\\\\",\\\\\\"title\\\\\\":\\\\\\"Kinderkarte\\\\\\",\\\\\\"type\\\\\\":\\\\\\"collection\\\\\\",\\\\\\"thumbnail\\\\\\":\\\\\\"https://geoportal-files.cismet.de/1751713695326-Bildschirmfoto%202025-07-05%20um%2013.06.25.png\\\\\\",\\\\\\"path\\\\\\":\\\\\\"POI\\\\\\",\\\\\\"serviceName\\\\\\":\\\\\\"discoverPoi\\\\\\",\\\\\\"tags\\\\\\":[\\\\\\"Kinderbetreuung\\\\\\",\\\\\\"Interessante Orte\\\\\\",\\\\\\"POI\\\\\\",\\\\\\"Bildung\\\\\\"],\\\\\\"backgroundLayer\\\\\\":{\\\\\\"title\\\\\\":\\\\\\"Stadtplan\\\\\\",\\\\\\"id\\\\\\":\\\\\\"karte\\\\\\",\\\\\\"opacity\\\\\\":1,\\\\\\"description\\\\\\":\\\\\\"\\\\\\",\\\\\\"inhalt\\\\\\":\\\\\\"<span>Kartendienst (WMS) des Regionalverbandes Ruhr (RVR). Datengrundlage: Stadtkarte 2.0. Wöchentlich in einem automatischen Prozess aktualisierte Zusammenführung des Straßennetzes der OpenStreetMap mit Amtlichen Geobasisdaten des Landes NRW aus den Fachverfahren ALKIS (Gebäude, Flächennutzungen) und ATKIS (Gewässer). © RVR und Kooperationspartner (</span><a class=\\\\\\\\\\\\\\"remove-margins\\\\\\\\\\\\\\" href=\\\\\\\\\\\\\\"https://www.govdata.de/dl-de/by-2-0\\\\\\\\\\\\\\">\\\\\\\\n                Datenlizenz Deutschland - Namensnennung - Version 2.0\\\\\\\\n              </a><span>). Lizenzen der Ausgangsprodukte: </span><a href=\\\\\\\\\\\\\\"https://www.govdata.de/dl-de/zero-2-0\\\\\\\\\\\\\\">\\\\\\\\n                Datenlizenz Deutschland - Zero - Version 2.0\\\\\\\\n              </a><span> (Amtliche Geobasisdaten) und </span><a href=\\\\\\\\\\\\\\"https://opendatacommons.org/licenses/odbl/1-0/\\\\\\\\\\\\\\">    ODbL    </a><span> (OpenStreetMap contributors).</span>\\\\\\",\\\\\\"eignung\\\\\\":\\\\\\"Der Stadtplan ist der am einfachsten und sichersten interpretierbare Kartenhintergrund, weil er an den von Stadtplänen geprägten Sehgewohnheiten von Kartennutzerinnen und -nutzern anschließt. Durch die schrittweise Reduzierung des Karteninhalts bei kleiner werdenden Maßstäben eignet sich der Stadtplan als Hintergrund für beliebige Maßstäbe. Aktualität: der Gebäudebestand ist durch die wöchentliche Ableitung aus dem Liegenschaftskataster sehr aktuell. Gebäude können sicher identifiziert werden, da bei Detailbetrachtungen alle Hausnummern dargestellt werden.\\\\\\",\\\\\\"visible\\\\\\":true,\\\\\\"layerType\\\\\\":\\\\\\"wmts\\\\\\",\\\\\\"props\\\\\\":{\\\\\\"name\\\\\\":\\\\\\"\\\\\\",\\\\\\"url\\\\\\":\\\\\\"https://geodaten.metropoleruhr.de/spw2?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=spw2_light&STYLE=default&FORMAT=image/png&TILEMATRIXSET=webmercator_hq&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}\\\\\\"},\\\\\\"layers\\\\\\":\\\\\\"amtlich@90\\\\\\"},\\\\\\"layers\\\\\\":[{\\\\\\"title\\\\\\":\\\\\\"Kindertagesstätten\\\\\\",\\\\\\"id\\\\\\":\\\\\\"wuppPOI:poi_kita\\\\\\",\\\\\\"layerType\\\\\\":\\\\\\"vector\\\\\\",\\\\\\"opacity\\\\\\":1,\\\\\\"description\\\\\\":\\\\\\"Inhalt: Vom Ressort Tageseinrichtungen für Kinder - Jugendamt laufend aktuell gehaltene Standorte vorhandener Tageseinrichtungen für Kinder im Stadtgebiet Wuppertal, anhand der Einrichtungs-Adressen punktförmig digitalisiert auf Basis der Liegenschaftskarte / Amtlichen Basiskarte; individuelle Informationen zur Einrichtung inklusive Link zur Homepage sind über die Sachdatenabfrage verfügbar. Sichtbarkeit: öffentlich. Nutzung: frei innerhalb der Grenzen des Urheberrechtsgesetzes; der zugrunde liegende Datensatz ist unter einer Open-Data-Lizenz (CC BY 4.0) verfügbar.\\\\\\",\\\\\\"conf\\\\\\":{\\\\\\"thumbnail\\\\\\":\\\\\\"https://www.wuppertal.de/geoportal/geoportal_vorschau/poi_poi_kita.png\\\\\\",\\\\\\"opendata\\\\\\":\\\\\\"https://www.offenedaten-wuppertal.de/dataset/kindertageseinrichtungen-wuppertal\\\\\\",\\\\\\"vectorStyle\\\\\\":\\\\\\"https://tiles.cismet.de/kita/style.json\\\\\\",\\\\\\"infoboxMapping\\\\\\":[\\\\\\"foto: p.foto\\\\\\",\\\\\\"header:\'Kinderbetreuung\'\\\\\\",\\\\\\"headerColor:p.schrift\\\\\\",\\\\\\"title:p.name\\\\\\",\\\\\\"additionalInfo:p.adresse + \', \' + p.traegertyp + \' (\' + p.traeger + \')\'\\\\\\",\\\\\\"subtitle:\'Plätze: \' + p.plaetze + \', \' + p.alter + \' Jahre\'\\\\\\",\\\\\\"url:p.url\\\\\\",\\\\\\"tel:p.telefon\\\\\\"]},\\\\\\"queryable\\\\\\":true,\\\\\\"useInFeatureInfo\\\\\\":true,\\\\\\"visible\\\\\\":true,\\\\\\"props\\\\\\":{\\\\\\"style\\\\\\":\\\\\\"https://tiles.cismet.de/kita/style.json\\\\\\",\\\\\\"minZoom\\\\\\":9,\\\\\\"maxZoom\\\\\\":24,\\\\\\"legend\\\\\\":[{\\\\\\"Format\\\\\\":\\\\\\"image/png\\\\\\",\\\\\\"OnlineResource\\\\\\":\\\\\\"https://www.wuppertal.de/geoportal/legenden/default_poi_kita.png\\\\\\",\\\\\\"size\\\\\\":[200,193]}],\\\\\\"metaData\\\\\\":[{\\\\\\"Format\\\\\\":\\\\\\"application/xml\\\\\\",\\\\\\"OnlineResource\\\\\\":\\\\\\"https://apps.geoportal.nrw.de/soapServices/CSWStartup?Service=CSW&Request=GetRecordById&Version=2.0.2&outputSchema=https://www.isotc211.org/2005/gmd&elementSetName=full&id=7840226c-4431-48d2-a4fb-9d5a1d51bda4\\\\\\",\\\\\\"type\\\\\\":\\\\\\"TC211\\\\\\"}]},\\\\\\"other\\\\\\":{\\\\\\"title\\\\\\":\\\\\\"Kindertagesstätten\\\\\\",\\\\\\"description\\\\\\":\\\\\\"Inhalt: Vom Ressort Tageseinrichtungen für Kinder - Jugendamt laufend aktuell gehaltene Standorte vorhandener Tageseinrichtungen für Kinder im Stadtgebiet Wuppertal, anhand der Einrichtungs-Adressen punktförmig digitalisiert auf Basis der Liegenschaftskarte / Amtlichen Basiskarte; individuelle Informationen zur Einrichtung inklusive Link zur Homepage sind über die Sachdatenabfrage verfügbar. Sichtbarkeit: öffentlich. Nutzung: frei innerhalb der Grenzen des Urheberrechtsgesetzes; der zugrunde liegende Datensatz ist unter einer Open-Data-Lizenz (CC BY 4.0) verfügbar.\\\\\\",\\\\\\"tags\\\\\\":[\\\\\\"POI\\\\\\"],\\\\\\"keywords\\\\\\":[\\\\\\"carmaconf://infoBoxMapping:foto: p.foto\\\\\\",\\\\\\"carmaconf://infoBoxMapping:header:\'Kinderbetreuung\'\\\\\\",\\\\\\"carmaconf://infoBoxMapping:headerColor:p.schrift\\\\\\",\\\\\\"carmaconf://infoBoxMapping:title:p.name\\\\\\",\\\\\\"carmaconf://infoBoxMapping:additionalInfo:p.adresse + \', \' + p.traegertyp + \' (\' + p.traeger + \')\'\\\\\\",\\\\\\"carmaconf://infoBoxMapping:subtitle:\'Plätze: \' + p.plaetze + \', \' + p.alter + \' Jahre\'\\\\\\",\\\\\\"carmaconf://infoBoxMapping:url:p.url\\\\\\",\\\\\\"carmaconf://infoBoxMapping:tel:p.telefon\\\\\\",\\\\\\"carmaConf://thumbnail:https://www.wuppertal.de/geoportal/geoportal_vorschau/poi_poi_kita.png\\\\\\",\\\\\\"carmaConf://opendata:https://www.offenedaten-wuppertal.de/dataset/kindertageseinrichtungen-wuppertal\\\\\\",\\\\\\"carmaConf://vectorStyle:https://tiles.cismet.de/kita/style.json\\\\\\",\\\\\\":vec:\\\\\\"],\\\\\\"id\\\\\\":\\\\\\"wuppPOI:poi_kita\\\\\\",\\\\\\"name\\\\\\":\\\\\\"poi_kita\\\\\\",\\\\\\"type\\\\\\":\\\\\\"layer\\\\\\",\\\\\\"layerType\\\\\\":\\\\\\"wmts\\\\\\",\\\\\\"queryable\\\\\\":true,\\\\\\"maxZoom\\\\\\":24,\\\\\\"minZoom\\\\\\":11,\\\\\\"serviceName\\\\\\":\\\\\\"wuppPOI\\\\\\",\\\\\\"path\\\\\\":\\\\\\"POI\\\\\\",\\\\\\"icon\\\\\\":\\\\\\"poi/Kindertagesstätten\\\\\\",\\\\\\"service\\\\\\":{\\\\\\"url\\\\\\":\\\\\\"https://maps.wuppertal.de/poi\\\\\\",\\\\\\"name\\\\\\":\\\\\\"wuppPOI\\\\\\"},\\\\\\"thumbnail\\\\\\":\\\\\\"https://www.wuppertal.de/geoportal/geoportal_vorschau/poi_poi_kita.png\\\\\\",\\\\\\"layerName\\\\\\":\\\\\\"poi_kita\\\\\\",\\\\\\"capabilitiesUrl\\\\\\":\\\\\\"https://maps.wuppertal.de/poi?service=WMS&request=GetCapabilities&version=1.1.1\\\\\\"}},{\\\\\\"title\\\\\\":\\\\\\"Grundschulen\\\\\\",\\\\\\"id\\\\\\":\\\\\\"wuppPOI:poi_schulen_grund\\\\\\",\\\\\\"layerType\\\\\\":\\\\\\"vector\\\\\\",\\\\\\"opacity\\\\\\":1,\\\\\\"description\\\\\\":\\\\\\"Inhalt: Ursprünglich aus Kartenproduktionen der Stadt Wuppertal abgeleitete nunmehr fortlaufend aktualisierte und kategorisierte interessante Orte (Points of Interest) im Wuppertaler Stadtgebiet oder dessen Nähe, punktförmig digitalisiert auf Basis der Flurkarte; individuelle Informationen zu den POI sind über die Sachdatenabfrage verfügbar; ausgeprägt werden die POI der Kategorie Schulen-Grundschulen. Sichtbarkeit: öffentlich. Nutzung: frei innerhalb der Grenzen des Urheberrechtsgesetzes; der zugrunde liegende Datensatz ist unter einer Open-Data-Lizenz (CC BY 4.0) verfügbar.\\\\\\",\\\\\\"conf\\\\\\":{\\\\\\"thumbnail\\\\\\":\\\\\\"https://www.wuppertal.de/geoportal/geoportal_vorschau/poi_poi_schulen_grund.png\\\\\\",\\\\\\"opendata\\\\\\":\\\\\\"https://www.offenedaten-wuppertal.de/dataset/schulen-wuppertal\\\\\\",\\\\\\"vectorStyle\\\\\\":\\\\\\"https://tiles.cismet.de/schulen/grundschule.style.json\\\\\\",\\\\\\"infoboxMapping\\\\\\":[\\\\\\"foto: p.foto\\\\\\",\\\\\\"header:\'Grundschule\'\\\\\\",\\\\\\"headerColor:p.farbe\\\\\\",\\\\\\"title:p.name\\\\\\",\\\\\\"additionalInfo:\'Träger: \' + p.traeger + \', \' + p.adresse\\\\\\",\\\\\\"subtitle:  \'OGS: \' + p.ogs + \', Betreuung: \' + p.gruppe + \', jahrgangsübergreifende Klassen: \' + p.jahrgang\\\\\\",\\\\\\"url:p.homepage\\\\\\",\\\\\\"tel:p.telefon\\\\\\"]},\\\\\\"queryable\\\\\\":true,\\\\\\"useInFeatureInfo\\\\\\":true,\\\\\\"visible\\\\\\":true,\\\\\\"props\\\\\\":{\\\\\\"style\\\\\\":\\\\\\"https://tiles.cismet.de/schulen/grundschule.style.json\\\\\\",\\\\\\"minZoom\\\\\\":10,\\\\\\"maxZoom\\\\\\":24,\\\\\\"legend\\\\\\":[{\\\\\\"Format\\\\\\":\\\\\\"image/png\\\\\\",\\\\\\"OnlineResource\\\\\\":\\\\\\"https://www.wuppertal.de/geoportal/legenden/default_poi_schulen_grund.png\\\\\\",\\\\\\"size\\\\\\":[200,170]}],\\\\\\"metaData\\\\\\":[{\\\\\\"Format\\\\\\":\\\\\\"application/xml\\\\\\",\\\\\\"OnlineResource\\\\\\":\\\\\\"https://apps.geoportal.nrw.de/soapServices/CSWStartup?Service=CSW&Request=GetRecordById&Version=2.0.2&outputSchema=https://www.isotc211.org/2005/gmd&elementSetName=full&id=b80bfc6d-2e74-4131-96ef-50b7b2cf657b\\\\\\",\\\\\\"type\\\\\\":\\\\\\"TC211\\\\\\"}]},\\\\\\"other\\\\\\":{\\\\\\"title\\\\\\":\\\\\\"Grundschulen\\\\\\",\\\\\\"description\\\\\\":\\\\\\"Inhalt: Ursprünglich aus Kartenproduktionen der Stadt Wuppertal abgeleitete nunmehr fortlaufend aktualisierte und kategorisierte interessante Orte (Points of Interest) im Wuppertaler Stadtgebiet oder dessen Nähe, punktförmig digitalisiert auf Basis der Flurkarte; individuelle Informationen zu den POI sind über die Sachdatenabfrage verfügbar; ausgeprägt werden die POI der Kategorie Schulen-Grundschulen. Sichtbarkeit: öffentlich. Nutzung: frei innerhalb der Grenzen des Urheberrechtsgesetzes; der zugrunde liegende Datensatz ist unter einer Open-Data-Lizenz (CC BY 4.0) verfügbar.\\\\\\",\\\\\\"tags\\\\\\":[\\\\\\"POI\\\\\\",\\\\\\"Schulen nach Schulform\\\\\\"],\\\\\\"keywords\\\\\\":[\\\\\\"carmaconf://infoBoxMapping:foto: p.foto\\\\\\",\\\\\\"carmaconf://infoBoxMapping:header:\'Grundschule\'\\\\\\",\\\\\\"carmaconf://infoBoxMapping:headerColor:p.farbe\\\\\\",\\\\\\"carmaconf://infoBoxMapping:title:p.name\\\\\\",\\\\\\"carmaconf://infoBoxMapping:additionalInfo:\'Träger: \' + p.traeger + \', \' + p.adresse\\\\\\",\\\\\\"carmaconf://infoBoxMapping:subtitle:  \'OGS: \' + p.ogs + \', Betreuung: \' + p.gruppe + \', jahrgangsübergreifende Klassen: \' + p.jahrgang\\\\\\",\\\\\\"carmaconf://infoBoxMapping:url:p.homepage\\\\\\",\\\\\\"carmaconf://infoBoxMapping:tel:p.telefon\\\\\\",\\\\\\"carmaConf://thumbnail:https://www.wuppertal.de/geoportal/geoportal_vorschau/poi_poi_schulen_grund.png\\\\\\",\\\\\\"carmaConf://opendata:https://www.offenedaten-wuppertal.de/dataset/schulen-wuppertal\\\\\\",\\\\\\"carmaConf://vectorStyle:https://tiles.cismet.de/schulen/grundschule.style.json\\\\\\",\\\\\\":vec:\\\\\\"],\\\\\\"id\\\\\\":\\\\\\"wuppPOI:poi_schulen_grund\\\\\\",\\\\\\"name\\\\\\":\\\\\\"poi_schulen_grund\\\\\\",\\\\\\"type\\\\\\":\\\\\\"layer\\\\\\",\\\\\\"layerType\\\\\\":\\\\\\"wmts\\\\\\",\\\\\\"queryable\\\\\\":true,\\\\\\"maxZoom\\\\\\":24,\\\\\\"minZoom\\\\\\":11,\\\\\\"serviceName\\\\\\":\\\\\\"wuppPOI\\\\\\",\\\\\\"path\\\\\\":\\\\\\"POI\\\\\\",\\\\\\"pictureBoundingBox\\\\\\":[790989.4779520752,6664143.201786021,800673.0939729535,6670157.840449209],\\\\\\"icon\\\\\\":\\\\\\"poi/Grundschulen\\\\\\",\\\\\\"service\\\\\\":{\\\\\\"url\\\\\\":\\\\\\"https://maps.wuppertal.de/poi\\\\\\",\\\\\\"name\\\\\\":\\\\\\"wuppPOI\\\\\\"},\\\\\\"thumbnail\\\\\\":\\\\\\"https://www.wuppertal.de/geoportal/geoportal_vorschau/poi_poi_schulen_grund.png\\\\\\",\\\\\\"layerName\\\\\\":\\\\\\"poi_schulen_grund\\\\\\",\\\\\\"capabilitiesUrl\\\\\\":\\\\\\"https://maps.wuppertal.de/poi?service=WMS&request=GetCapabilities&version=1.1.1\\\\\\"}},{\\\\\\"title\\\\\\":\\\\\\"Kinderspielplätze 2022\\\\\\",\\\\\\"id\\\\\\":\\\\\\"wuppPOI:poi_ksp\\\\\\",\\\\\\"layerType\\\\\\":\\\\\\"vector\\\\\\",\\\\\\"opacity\\\\\\":0.8,\\\\\\"description\\\\\\":\\\\\\"Inhalt: Darstellung der öffentlich zugänglichen Spielflächen und Bolzplätze im Stadtgebiet Wuppertal; Bestandsaufnahme im Jahr 2022.Sichtbarkeit: öffentlich. Nutzung: frei innerhalb der Grenzen des Urheberrechtsgesetzes.\\\\\\",\\\\\\"conf\\\\\\":{\\\\\\"thumbnail\\\\\\":\\\\\\"https://www.wuppertal.de/geoportal/geoportal_vorschau/poi_poi_ksp.png\\\\\\",\\\\\\"vectorStyle\\\\\\":\\\\\\"https://tiles.cismet.de/kinderspielplatz/style.json\\\\\\",\\\\\\"infoboxMapping\\\\\\":[\\\\\\"header:\'Kinderspielplätze\'\\\\\\",\\\\\\"headerColor:\'#C52C6B\'\\\\\\",\\\\\\"title:p.name\\\\\\",\\\\\\"subtitle: \'Fläche: \' + p.flaeche + \' m²\'\\\\\\",\\\\\\"additionalInfo:p.typ\\\\\\"]},\\\\\\"queryable\\\\\\":true,\\\\\\"useInFeatureInfo\\\\\\":true,\\\\\\"visible\\\\\\":true,\\\\\\"props\\\\\\":{\\\\\\"style\\\\\\":\\\\\\"https://tiles.cismet.de/kinderspielplatz/style.json\\\\\\",\\\\\\"minZoom\\\\\\":9,\\\\\\"maxZoom\\\\\\":24,\\\\\\"legend\\\\\\":[{\\\\\\"Format\\\\\\":\\\\\\"image/png\\\\\\",\\\\\\"OnlineResource\\\\\\":\\\\\\"https://www.wuppertal.de/geoportal/legenden/default_kinderspielplaetze2022.png\\\\\\",\\\\\\"size\\\\\\":[231,418]}]},\\\\\\"other\\\\\\":{\\\\\\"title\\\\\\":\\\\\\"Kinderspielplätze 2022\\\\\\",\\\\\\"description\\\\\\":\\\\\\"Inhalt: Darstellung der öffentlich zugänglichen Spielflächen und Bolzplätze im Stadtgebiet Wuppertal; Bestandsaufnahme im Jahr 2022.Sichtbarkeit: öffentlich. Nutzung: frei innerhalb der Grenzen des Urheberrechtsgesetzes.\\\\\\",\\\\\\"tags\\\\\\":[\\\\\\"POI\\\\\\"],\\\\\\"keywords\\\\\\":[\\\\\\"carmaconf://infoBoxMapping:header:\'Kinderspielplätze\'\\\\\\",\\\\\\"carmaconf://infoBoxMapping:headerColor:\'#C52C6B\'\\\\\\",\\\\\\"carmaconf://infoBoxMapping:title:p.name\\\\\\",\\\\\\"carmaconf://infoBoxMapping:subtitle: \'Fläche: \' + p.flaeche + \' m²\'\\\\\\",\\\\\\"carmaconf://infoBoxMapping:additionalInfo:p.typ\\\\\\",\\\\\\"carmaConf://thumbnail:https://www.wuppertal.de/geoportal/geoportal_vorschau/poi_poi_ksp.png\\\\\\",\\\\\\"carmaConf://vectorStyle:https://tiles.cismet.de/kinderspielplatz/style.json\\\\\\",\\\\\\":vec:\\\\\\"],\\\\\\"id\\\\\\":\\\\\\"wuppPOI:poi_ksp\\\\\\",\\\\\\"name\\\\\\":\\\\\\"poi_ksp\\\\\\",\\\\\\"type\\\\\\":\\\\\\"layer\\\\\\",\\\\\\"layerType\\\\\\":\\\\\\"wmts\\\\\\",\\\\\\"queryable\\\\\\":true,\\\\\\"maxZoom\\\\\\":24,\\\\\\"minZoom\\\\\\":12,\\\\\\"serviceName\\\\\\":\\\\\\"wuppPOI\\\\\\",\\\\\\"path\\\\\\":\\\\\\"POI\\\\\\",\\\\\\"icon\\\\\\":\\\\\\"poi/Kinderspielplätze_2022\\\\\\",\\\\\\"service\\\\\\":{\\\\\\"url\\\\\\":\\\\\\"https://maps.wuppertal.de/poi\\\\\\",\\\\\\"name\\\\\\":\\\\\\"wuppPOI\\\\\\"},\\\\\\"thumbnail\\\\\\":\\\\\\"https://www.wuppertal.de/geoportal/geoportal_vorschau/poi_poi_ksp.png\\\\\\",\\\\\\"layerName\\\\\\":\\\\\\"poi_ksp\\\\\\",\\\\\\"capabilitiesUrl\\\\\\":\\\\\\"https://maps.wuppertal.de/poi?service=WMS&request=GetCapabilities&version=1.1.1\\\\\\"}}],\\\\\\"id\\\\\\":\\\\\\"39\\\\\\",\\\\\\"isDraft\\\\\\":false}\\", \\"draft\\" : false}, {\\"id\\" : 5, \\"name\\" : \\"Wohnlagenkarte\\", \\"config\\" : \\"{\\\\\\"description\\\\\\":\\\\\\"Inhalt: Vom Gutachterausschuss für Grundstückswerte in der Stadt Wuppertal am 16.04.2024 beschlossene vierstufige Klassifizierung der Wuppertaler Wohnlagen zum Stichtag 01.01.2024 mit dem wöchentlich aktualisierten Amtlichen Stadtplan (Stadtkarte 2.0) als Hintergrund.\\\\\\\\n\\\\\\\\nVerwendungszweck: Ermittlung von Wohnlagen gemäß Nr. 6.9 des qualifizierten Mietspiegels der Stadt Wuppertal für die Ermittlung ortsüblicher Vergleichsmieten.\\\\\\",\\\\\\"title\\\\\\":\\\\\\"Wohnlagenkarte\\\\\\",\\\\\\"type\\\\\\":\\\\\\"collection\\\\\\",\\\\\\"thumbnail\\\\\\":\\\\\\"https://carma-dev-deployments.github.io/geoportal/assets/wohnlagen-BLMdOInc.png\\\\\\",\\\\\\"path\\\\\\":\\\\\\"Immobilien\\\\\\",\\\\\\"serviceName\\\\\\":\\\\\\"discoverImmo\\\\\\",\\\\\\"backgroundLayer\\\\\\":{\\\\\\"title\\\\\\":\\\\\\"Stadtplan\\\\\\",\\\\\\"id\\\\\\":\\\\\\"karte\\\\\\",\\\\\\"opacity\\\\\\":1,\\\\\\"description\\\\\\":\\\\\\"\\\\\\",\\\\\\"inhalt\\\\\\":\\\\\\"<span>Kartendienst (WMS) des Regionalverbandes Ruhr (RVR). Datengrundlage: Stadtkarte 2.0. Wöchentlich in einem automatischen Prozess aktualisierte Zusammenführung des Straßennetzes der OpenStreetMap mit Amtlichen Geobasisdaten des Landes NRW aus den Fachverfahren ALKIS (Gebäude, Flächennutzungen) und ATKIS (Gewässer). © RVR und Kooperationspartner (</span><a class=\\\\\\\\\\\\\\"remove-margins\\\\\\\\\\\\\\" href=\\\\\\\\\\\\\\"https://www.govdata.de/dl-de/by-2-0\\\\\\\\\\\\\\">\\\\\\\\n                Datenlizenz Deutschland - Namensnennung - Version 2.0\\\\\\\\n              </a><span>). Lizenzen der Ausgangsprodukte: </span><a href=\\\\\\\\\\\\\\"https://www.govdata.de/dl-de/zero-2-0\\\\\\\\\\\\\\">\\\\\\\\n                Datenlizenz Deutschland - Zero - Version 2.0\\\\\\\\n              </a><span> (Amtliche Geobasisdaten) und </span><a href=\\\\\\\\\\\\\\"https://opendatacommons.org/licenses/odbl/1-0/\\\\\\\\\\\\\\">    ODbL    </a><span> (OpenStreetMap contributors).</span>\\\\\\",\\\\\\"eignung\\\\\\":\\\\\\"Der Stadtplan ist der am einfachsten und sichersten interpretierbare Kartenhintergrund, weil er an den von Stadtplänen geprägten Sehgewohnheiten von Kartennutzerinnen und -nutzern anschließt. Durch die schrittweise Reduzierung des Karteninhalts bei kleiner werdenden Maßstäben eignet sich der Stadtplan als Hintergrund für beliebige Maßstäbe. Aktualität: der Gebäudebestand ist durch die wöchentliche Ableitung aus dem Liegenschaftskataster sehr aktuell. Gebäude können sicher identifiziert werden, da bei Detailbetrachtungen alle Hausnummern dargestellt werden.\\\\\\",\\\\\\"visible\\\\\\":true,\\\\\\"layerType\\\\\\":\\\\\\"wmts\\\\\\",\\\\\\"props\\\\\\":{\\\\\\"name\\\\\\":\\\\\\"\\\\\\",\\\\\\"url\\\\\\":\\\\\\"https://geodaten.metropoleruhr.de/spw2?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=spw2_light&STYLE=default&FORMAT=image/png&TILEMATRIXSET=webmercator_hq&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}\\\\\\"},\\\\\\"layers\\\\\\":\\\\\\"amtlich@90\\\\\\"},\\\\\\"layers\\\\\\":[{\\\\\\"title\\\\\\":\\\\\\"Wohnlagen 2025\\\\\\",\\\\\\"id\\\\\\":\\\\\\"wuppImmo:wohnlagen2025\\\\\\",\\\\\\"layerType\\\\\\":\\\\\\"vector\\\\\\",\\\\\\"opacity\\\\\\":1,\\\\\\"description\\\\\\":\\\\\\"Inhalt: Vom Gutachterausschuss für Grundstückswerte in der Stadt Wuppertal am 20.03.2025 beschlossene vierstufige Klassifizierung der Wuppertaler Wohnlagen zum Stichtag 01.01.2025; die räumliche Auflösung orientiert sich an den Baublöcken aus der kleinräumigen Gliederung der Stadt Wuppertal, weicht im Detail aber an etlichen Stellen von dieser Gebietsgliederung ab; die in der jeweiligen Zone dargestellte Wohnlage beschreibt deren überwiegenden Charakter, die Lagequalität einzelner Grundstücke kann abweichen. Sichtbarkeit: öffentlich. Nutzung: frei innerhalb der Grenzen des Urheberrechtsgesetzes; der zugrunde liegende Datensatz ist unter einer Open-Data-Lizenz (dl-de/by-2-0) verfügbar\\\\\\",\\\\\\"conf\\\\\\":{\\\\\\"thumbnail\\\\\\":\\\\\\"https://www.wuppertal.de/geoportal/geoportal_vorschau/immo_wohnlagen2025.png\\\\\\",\\\\\\"opendata\\\\\\":\\\\\\"https://www.offenedaten-wuppertal.de/dataset/wohnlagen-wuppertal\\\\\\",\\\\\\"vectorStyle\\\\\\":\\\\\\"https://tiles.cismet.de/wohnlagen2025/style.json\\\\\\",\\\\\\"infoboxMapping\\\\\\":[\\\\\\"function createInfoBoxInfo(p) { let color = \'#006c72\'; switch(p.wlcode) { case 1: color = \'#FF0000\'; break; case 2: color = \'#FFC000\'; break; case 3: color = \'#92D050\'; break; case 4: color = \'#00C5FF\'; break; } const info = { title: p.wohnlage, headerColor: color, header: \'Wohnlagen 2025\', }; return info; }\\\\\\"]},\\\\\\"queryable\\\\\\":true,\\\\\\"useInFeatureInfo\\\\\\":true,\\\\\\"visible\\\\\\":true,\\\\\\"props\\\\\\":{\\\\\\"style\\\\\\":\\\\\\"https://tiles.cismet.de/wohnlagen2025/style.json\\\\\\",\\\\\\"minZoom\\\\\\":9,\\\\\\"maxZoom\\\\\\":24,\\\\\\"legend\\\\\\":[{\\\\\\"Format\\\\\\":\\\\\\"image/png\\\\\\",\\\\\\"OnlineResource\\\\\\":\\\\\\"https://www.wuppertal.de/geoportal/legenden/default_wohnlagenkarte_2025.png\\\\\\",\\\\\\"size\\\\\\":[230,334]}],\\\\\\"metaData\\\\\\":[{\\\\\\"Format\\\\\\":\\\\\\"application/xml\\\\\\",\\\\\\"OnlineResource\\\\\\":\\\\\\"https://apps.geoportal.nrw.de/soapServices/CSWStartup?Service=CSW&Request=GetRecordById&Version=2.0.2&outputSchema=https://www.isotc211.org/2005/gmd&elementSetName=full&id=91fe8f8d-fccb-437b-bd5f-4b114d4a84b5\\\\\\",\\\\\\"type\\\\\\":\\\\\\"TC211\\\\\\"}]},\\\\\\"other\\\\\\":{\\\\\\"title\\\\\\":\\\\\\"Wohnlagen 2025\\\\\\",\\\\\\"description\\\\\\":\\\\\\"Inhalt: Vom Gutachterausschuss für Grundstückswerte in der Stadt Wuppertal am 20.03.2025 beschlossene vierstufige Klassifizierung der Wuppertaler Wohnlagen zum Stichtag 01.01.2025; die räumliche Auflösung orientiert sich an den Baublöcken aus der kleinräumigen Gliederung der Stadt Wuppertal, weicht im Detail aber an etlichen Stellen von dieser Gebietsgliederung ab; die in der jeweiligen Zone dargestellte Wohnlage beschreibt deren überwiegenden Charakter, die Lagequalität einzelner Grundstücke kann abweichen. Sichtbarkeit: öffentlich. Nutzung: frei innerhalb der Grenzen des Urheberrechtsgesetzes; der zugrunde liegende Datensatz ist unter einer Open-Data-Lizenz (dl-de/by-2-0) verfügbar\\\\\\",\\\\\\"tags\\\\\\":[\\\\\\"Immobilien\\\\\\"],\\\\\\"keywords\\\\\\":[\\\\\\"carmaConf://thumbnail:https://www.wuppertal.de/geoportal/geoportal_vorschau/immo_wohnlagen2025.png\\\\\\",\\\\\\"carmaConf://opendata:https://www.offenedaten-wuppertal.de/dataset/wohnlagen-wuppertal\\\\\\",\\\\\\"carmaConf://vectorStyle:https://tiles.cismet.de/wohnlagen2025/style.json\\\\\\",\\\\\\"carmaconf://infoBoxMapping:function createInfoBoxInfo(p) { let color = \'#006c72\'; switch(p.wlcode) { case 1: color = \'#FF0000\'; break; case 2: color = \'#FFC000\'; break; case 3: color = \'#92D050\'; break; case 4: color = \'#00C5FF\'; break; } const info = { title: p.wohnlage, headerColor: color, header: \'Wohnlagen 2025\', }; return info; }\\\\\\",\\\\\\":vec:\\\\\\"],\\\\\\"id\\\\\\":\\\\\\"wuppImmo:wohnlagen2025\\\\\\",\\\\\\"name\\\\\\":\\\\\\"wohnlagen2025\\\\\\",\\\\\\"type\\\\\\":\\\\\\"layer\\\\\\",\\\\\\"layerType\\\\\\":\\\\\\"wmts\\\\\\",\\\\\\"queryable\\\\\\":true,\\\\\\"maxZoom\\\\\\":24,\\\\\\"minZoom\\\\\\":10,\\\\\\"serviceName\\\\\\":\\\\\\"wuppImmo\\\\\\",\\\\\\"path\\\\\\":\\\\\\"Immobilien\\\\\\",\\\\\\"icon\\\\\\":\\\\\\"immo/Wohnlagen_2024\\\\\\",\\\\\\"service\\\\\\":{\\\\\\"url\\\\\\":\\\\\\"https://maps.wuppertal.de/immo\\\\\\",\\\\\\"name\\\\\\":\\\\\\"wuppImmo\\\\\\"},\\\\\\"thumbnail\\\\\\":\\\\\\"https://www.wuppertal.de/geoportal/geoportal_vorschau/immo_wohnlagen2025.png\\\\\\",\\\\\\"layerName\\\\\\":\\\\\\"wohnlagen2025\\\\\\",\\\\\\"capabilitiesUrl\\\\\\":\\\\\\"https://maps.wuppertal.de/immo?service=WMS&request=GetCapabilities&version=1.1.1\\\\\\"}}],\\\\\\"id\\\\\\":\\\\\\"16\\\\\\",\\\\\\"tags\\\\\\":[\\\\\\"Wohnlagen\\\\\\",\\\\\\"Immobilien\\\\\\"],\\\\\\"isDraft\\\\\\":false}\\", \\"draft\\" : false}, {\\"id\\" : 11, \\"name\\" : \\"Luftbildkarte mit Flurstücken und Gebäuden\\", \\"config\\" : \\"{\\\\\\"description\\\\\\":\\\\\\"Inhalt: Selektier- und abfragbare Vektordatenrepräsentation der Wuppertaler Flurstücke und Gebäude aus dem Amtlichen Liegenschaftskataster-Informationssystem ALKIS mit dem True Orthofoto von 03/24 (Bodenauflösung 3 cm) als Hintergrund; frei definierte gelbe Strichdarstellung ohne Bezug zum Signaturenkatalog NRW. Verwendungszweck: Anschauliche Darstellung von Grenzverläufen in der Örtlichkeit sowie schnelle und einfache Entnahme von Informationen zu den ALKIS-Flurstücken und -Gebäuden für Grundstückseigentümer/innen und Teilnehmer/innen am Wuppertaler Immobilienmarkt; direkter Übergang zur gebührenpflichtigen Online-Bestellung von Liegenschaftskarten.\\\\\\",\\\\\\"title\\\\\\":\\\\\\"Luftbildkarte mit Flurstücken und Gebäuden\\\\\\",\\\\\\"type\\\\\\":\\\\\\"collection\\\\\\",\\\\\\"thumbnail\\\\\\":\\\\\\"https://geoportal-files.cismet.de/1756896725686-Luftbildkarte_mit_Flurst%C3%BCcken.png\\\\\\",\\\\\\"path\\\\\\":\\\\\\"Basis\\\\\\",\\\\\\"serviceName\\\\\\":\\\\\\"discoverBasis\\\\\\",\\\\\\"tags\\\\\\":[\\\\\\"True Orthofoto\\\\\\",\\\\\\"Luftbildkarte\\\\\\",\\\\\\"Liegenschaftskataster\\\\\\",\\\\\\"Flurstück\\\\\\",\\\\\\"Flurstücksnummer\\\\\\",\\\\\\"Gebäude\\\\\\",\\\\\\"Bauwerk\\\\\\"],\\\\\\"backgroundLayer\\\\\\":{\\\\\\"title\\\\\\":\\\\\\"Luftbildkarte 03/24\\\\\\",\\\\\\"id\\\\\\":\\\\\\"luftbild\\\\\\",\\\\\\"opacity\\\\\\":1,\\\\\\"description\\\\\\":\\\\\\"Luftbildkarte (aus True Orthofoto 03/24) © Stadt Wuppertal / RVR und Kooperationspartner\\\\\\",\\\\\\"inhalt\\\\\\":\\\\\\"<span>(1) Kartendienst (WMS) der Stadt Wuppertal. Datengrundlage:\\\\\\\\n               True Orthofoto aus Bildflügen vom 14.03. und 17.03.2024, hergestellt durch Aerowest\\\\\\\\n              GmbH/Dortmund, Bodenauflösung 3 cm.\\\\\\\\n              (True Orthofoto: Aus Luftbildern mit hoher Längs- und Querüberdeckung\\\\\\\\n              in einem automatisierten Bildverarbeitungsprozess\\\\\\\\n              berechnetes Bild in Parallelprojektion, also ohne Gebäudeverkippung und sichttote Bereiche.) © Stadt Wuppertal (</span>\\\\\\\\n              <a class=\\\\\\\\\\\\\\"remove-margins\\\\\\\\\\\\\\" href=\\\\\\\\\\\\\\"https://www.wuppertal.de/geoportal/Nutzungsbedingungen/NB-GDIKOM-C_Geodaten.pdf\\\\\\\\\\\\\\">NB-GDIKOM C</a>\\\\\\\\n              <span>). (2) Kartendienste (WMS) des Regionalverbandes Ruhr (RVR). Datengrundlagen:\\\\\\\\n              Stadtkarte 2.0 und Kartenschrift aus der Stadtkarte 2.0. Details s. Hintergrundkarte Stadtplan).</span>\\\\\\",\\\\\\"eignung\\\\\\":\\\\\\"Luftbildkarten eignen sich wegen ihrer Anschaulichkeit und ihres Inhaltsreichtums vor allem für Detailbetrachtungen. Durch die Verwendung eines \\\\\\\\\\\\\\"True Orthofotos\\\\\\\\\\\\\\" ist die passgenaue Überlagerung mit grundrisstreuen Kartenebenen möglich. Die Luftbildkarte 03/24 basiert auf einer von der Stadt Wuppertal beauftragten Befliegung vor dem Einsetzen der Belaubung (Winterbefliegung). Die Straßenbereiche sind daher vollständig sichtbar, während die Grünbereiche nicht gut zu interpretieren sind. Aktualität: Wuppertal lässt in einem Turnus von 2 Jahren Bildflüge durchführen. Die dargestellte Situation, z. B. bezüglich des Gebäudebestandes, kann daher bis zu 2,5 Jahre alt sein.\\\\\\",\\\\\\"visible\\\\\\":true,\\\\\\"layerType\\\\\\":\\\\\\"wmts\\\\\\",\\\\\\"props\\\\\\":{\\\\\\"name\\\\\\":\\\\\\"\\\\\\",\\\\\\"url\\\\\\":\\\\\\"https://maps.wuppertal.de/karten?service=WMS&request=GetMap&layers=R102%3Aluftbild2022\\\\\\"},\\\\\\"layers\\\\\\":\\\\\\"rvrGrundriss@100|trueOrtho2024Alternative@75|rvrSchriftNT@100\\\\\\"},\\\\\\"layers\\\\\\":[{\\\\\\"title\\\\\\":\\\\\\"ALKIS Flurstücke / Gebäude (gelb)\\\\\\",\\\\\\"id\\\\\\":\\\\\\"wuppDev:expg\\\\\\",\\\\\\"layerType\\\\\\":\\\\\\"vector\\\\\\",\\\\\\"opacity\\\\\\":1,\\\\\\"description\\\\\\":\\\\\\"Inhalt: Tagesaktuelle Vektordaten der Flurstücke und Gebäude aus dem Amtlichen Liegenschaftskataster-Informationssystem ALKIS der Stadt Wuppertal; frei definierte gelbe Strichdarstellung ohne Bezug zum Signaturenkatalog NRW, geeignet als Überlagerung einer Luftbildkarte. Nutzung: Frei innerhalb der Grenzen des Urheberrechtsgesetzes; die zugrunde liegenden Datensätze sind mit Wochenaktualität unter einer Open-Data-Lizenz (dl-zero-de/2.0) verfügbar.\\\\\\",\\\\\\"conf\\\\\\":{\\\\\\"blockLegacyGetFeatureInfo\\\\\\":\\\\\\"\\\\\\",\\\\\\"opendata\\\\\\":\\\\\\"https://offenedaten-wuppertal.de/search/topic/layer-flurst%C3%BCcke-und-geb%C3%A4ude-1175\\\\\\",\\\\\\"infoboxMapping\\\\\\":[\\\\\\"function createInfoBoxInfo(p) { const gemarkungen = { 3001: \'Barmen\', 3485: \'Beyenburg\', 3279: \'Cronenberg\', 3278: \'Dönberg\', 3135: \'Elberfeld\', 3486: \'Langerfeld\', 3487: \'Nächstebreck\', 3267: \'Ronsdorf\', 3276: \'Schöller\', 3277: \'Vohwinkel\' }; const isFlurstueck = ( p.carmaInfo?.sourceLayer === \'landparcel\' || p.carmaInfo?.selectionForwardingTo?.includes(\'landparcel\') ); const isGebaeude =( p.carmaInfo?.sourceLayer === \'building\' || p.carmaInfo?.selectionForwardingTo?.includes(\'building\') ); const isGebaeudestruktur =( p.carmaInfo?.sourceLayer === \'buildingstructure\' || p.carmaInfo?.selectionForwardingTo?.includes(\'buildingstructure\') ); if (isFlurstueck) { const landparcel=p.targetProperties || p; return { headerColor: \'#FAFF13\', header: \'Flurstück\', title: `${landparcel.gemarkungsnummer}-${landparcel.flurnummer}-${landparcel.zaehler}/${landparcel.nenner ? landparcel.nenner : \'0\'}`, additionalInfo: `<html>` + `Gemarkung: ${gemarkungen[landparcel.gemarkungsnummer]} (${landparcel.gemarkungsnummer})<br/>` + `Flur: ${landparcel.flurnummer}<br/>` + `Flurstück: ${landparcel.zaehler}${landparcel.nenner ? \'/\' + landparcel.nenner : \'\'}` + `</html>`, subtitle: `<html>` + `Adresse: ${landparcel.adresse}<br/>` + `Fläche: ${landparcel.flaeche_m2} m²` + `</html>`, genericLinks: [{ tooltip: \'Bestellung von Liegenschaftskarten\', url: `https://formulare.wuppertal.de/metaform/Form-Solutions/sid/assistant/5587cff10cf2ac88b8a11a72?Antragsteller.Daten.Auswahl%20%C3%BCber=Flurst%C3%BCck&Antragsteller.Daten.GeoLocation2.Gemarkung=${gemarkungen[landparcel.gemarkungsnummer]}%20(${landparcel.gemarkungsnummer})&Antragsteller.Daten.GeoLocation2.Flurnummer=${landparcel.flurnummer}&Antragsteller.Daten.GeoLocation2.Flurst%C3%BCck=${landparcel.zaehler}${landparcel.nenner ? \'%2F\'+landparcel.nenner : \'\'}`, iconname: \'shopping-cart\' }] }; } else if (isGebaeude) { const geb=p.targetProperties || p; return { headerColor: \'#FAFF13\', header: `${geb.geb_typ.trim()==\'Hauptgebäude\'?\'Hauptgebäude\':geb.geb_typ.replaceAll(\'_\', \' \')}`, title: `${geb.strname} ${geb.hnr?(geb.hnr===\'mehrere\'?\'(mehrere)\':geb.hnr):(geb.hausnr?geb.hausnr+\' \'+geb.adr_zusatz.trim():\'\')}`, additionalInfo: `<html>` + `Funktion: ${geb.geb_fkt}<br/>` + `Grundfläche: ${geb.flaeche} m²<br/>` + `</html>`, subtitle: `<html>` + `${geb.oeffentl==\'1\'?\'Öffentliches Gebäude\':\'\'}` + `</html>` }; }else if (isGebaeudestruktur) { const gebs=p.targetProperties || p; return { headerColor: \'#FAFF13\', header: \'Bauwerk\', title: `${gebs.funktion_txt}`, }; } else { return null; } }\\\\\\"]},\\\\\\"queryable\\\\\\":true,\\\\\\"useInFeatureInfo\\\\\\":true,\\\\\\"visible\\\\\\":true,\\\\\\"props\\\\\\":{\\\\\\"style\\\\\\":\\\\\\"https://tiles.cismet.de/alkis/flurstuecke.yellow.style.json\\\\\\",\\\\\\"minZoom\\\\\\":13,\\\\\\"maxZoom\\\\\\":24,\\\\\\"legend\\\\\\":[{\\\\\\"Format\\\\\\":\\\\\\"image/png\\\\\\",\\\\\\"OnlineResource\\\\\\":\\\\\\"https://www.wuppertal.de/geoportal/legenden/default_R102_ALKIS_Vektor_FlstGeb_gelb.png\\\\\\",\\\\\\"size\\\\\\":[231,358]}]},\\\\\\"other\\\\\\":{\\\\\\"replaceId\\\\\\":\\\\\\"wuppKarten:expg\\\\\\",\\\\\\"title\\\\\\":\\\\\\"ALKIS Flurstücke / Gebäude (gelb)\\\\\\",\\\\\\"description\\\\\\":\\\\\\"Inhalt: Tagesaktuelle Vektordaten der Flurstücke und Gebäude aus dem Amtlichen Liegenschaftskataster-Informationssystem ALKIS der Stadt Wuppertal; frei definierte gelbe Strichdarstellung ohne Bezug zum Signaturenkatalog NRW, geeignet als Überlagerung einer Luftbildkarte. Nutzung: Frei innerhalb der Grenzen des Urheberrechtsgesetzes; die zugrunde liegenden Datensätze sind mit Wochenaktualität unter einer Open-Data-Lizenz (dl-zero-de/2.0) verfügbar.\\\\\\",\\\\\\"tags\\\\\\":[\\\\\\"Basis\\\\\\",\\\\\\"Liegenschaftskataster\\\\\\",\\\\\\"Flurstück\\\\\\",\\\\\\"Flurstücksnummer\\\\\\",\\\\\\"Gebäude\\\\\\",\\\\\\"Bauwerk\\\\\\"],\\\\\\"keywords\\\\\\":[\\\\\\"carmaconf://infoBoxMapping:function createInfoBoxInfo(p) { const gemarkungen = { 3001: \'Barmen\', 3485: \'Beyenburg\', 3279: \'Cronenberg\', 3278: \'Dönberg\', 3135: \'Elberfeld\', 3486: \'Langerfeld\', 3487: \'Nächstebreck\', 3267: \'Ronsdorf\', 3276: \'Schöller\', 3277: \'Vohwinkel\' }; const isFlurstueck = ( p.carmaInfo?.sourceLayer === \'landparcel\' || p.carmaInfo?.selectionForwardingTo?.includes(\'landparcel\') ); const isGebaeude =( p.carmaInfo?.sourceLayer === \'building\' || p.carmaInfo?.selectionForwardingTo?.includes(\'building\') ); const isGebaeudestruktur =( p.carmaInfo?.sourceLayer === \'buildingstructure\' || p.carmaInfo?.selectionForwardingTo?.includes(\'buildingstructure\') ); if (isFlurstueck) { const landparcel=p.targetProperties || p; return { headerColor: \'#FAFF13\', header: \'Flurstück\', title: `${landparcel.gemarkungsnummer}-${landparcel.flurnummer}-${landparcel.zaehler}/${landparcel.nenner ? landparcel.nenner : \'0\'}`, additionalInfo: `<html>` + `Gemarkung: ${gemarkungen[landparcel.gemarkungsnummer]} (${landparcel.gemarkungsnummer})<br/>` + `Flur: ${landparcel.flurnummer}<br/>` + `Flurstück: ${landparcel.zaehler}${landparcel.nenner ? \'/\' + landparcel.nenner : \'\'}` + `</html>`, subtitle: `<html>` + `Adresse: ${landparcel.adresse}<br/>` + `Fläche: ${landparcel.flaeche_m2} m²` + `</html>`, genericLinks: [{ tooltip: \'Bestellung von Liegenschaftskarten\', url: `https://formulare.wuppertal.de/metaform/Form-Solutions/sid/assistant/5587cff10cf2ac88b8a11a72?Antragsteller.Daten.Auswahl%20%C3%BCber=Flurst%C3%BCck&Antragsteller.Daten.GeoLocation2.Gemarkung=${gemarkungen[landparcel.gemarkungsnummer]}%20(${landparcel.gemarkungsnummer})&Antragsteller.Daten.GeoLocation2.Flurnummer=${landparcel.flurnummer}&Antragsteller.Daten.GeoLocation2.Flurst%C3%BCck=${landparcel.zaehler}${landparcel.nenner ? \'%2F\'+landparcel.nenner : \'\'}`, iconname: \'shopping-cart\' }] }; } else if (isGebaeude) { const geb=p.targetProperties || p; return { headerColor: \'#FAFF13\', header: `${geb.geb_typ.trim()==\'Hauptgebäude\'?\'Hauptgebäude\':geb.geb_typ.replaceAll(\'_\', \' \')}`, title: `${geb.strname} ${geb.hnr?(geb.hnr===\'mehrere\'?\'(mehrere)\':geb.hnr):(geb.hausnr?geb.hausnr+\' \'+geb.adr_zusatz.trim():\'\')}`, additionalInfo: `<html>` + `Funktion: ${geb.geb_fkt}<br/>` + `Grundfläche: ${geb.flaeche} m²<br/>` + `</html>`, subtitle: `<html>` + `${geb.oeffentl==\'1\'?\'Öffentliches Gebäude\':\'\'}` + `</html>` }; }else if (isGebaeudestruktur) { const gebs=p.targetProperties || p; return { headerColor: \'#FAFF13\', header: \'Bauwerk\', title: `${gebs.funktion_txt}`, }; } else { return null; } }\\\\\\",\\\\\\"carmaconf://blockLegacyGetFeatureInfo\\\\\\",\\\\\\"carmaConf://opendata:https://offenedaten-wuppertal.de/search/topic/layer-flurst%C3%BCcke-und-geb%C3%A4ude-1175\\\\\\"],\\\\\\"id\\\\\\":\\\\\\"wuppDev:expg\\\\\\",\\\\\\"name\\\\\\":\\\\\\"expg\\\\\\",\\\\\\"type\\\\\\":\\\\\\"layer\\\\\\",\\\\\\"layerType\\\\\\":\\\\\\"vector\\\\\\",\\\\\\"queryable\\\\\\":true,\\\\\\"maxZoom\\\\\\":24,\\\\\\"minZoom\\\\\\":14,\\\\\\"path\\\\\\":\\\\\\"Basis\\\\\\",\\\\\\"pictureBoundingBox\\\\\\":[784874.5156892611,6655868.893474152,821182.1041247197,6679927.448126909],\\\\\\"icon\\\\\\":\\\\\\"basis/ALKIS_Flurstuecke_Gebaude_gelb\\\\\\",\\\\\\"thumbnail\\\\\\":\\\\\\"https://tiles.cismet.de/alkis/assets/alkis_flurstuecke_gelb.png\\\\\\",\\\\\\"vectorStyle\\\\\\":\\\\\\"https://tiles.cismet.de/alkis/flurstuecke.yellow.style.json\\\\\\",\\\\\\"serviceName\\\\\\":\\\\\\"wuppKarten\\\\\\",\\\\\\"layerName\\\\\\":\\\\\\"expg\\\\\\"}}]}\\", \\"draft\\" : false}, {\\"id\\" : 12, \\"name\\" : \\"ABK mit Flurstücken und Gebäuden aus Flurkarte\\", \\"config\\" : \\"{\\\\\\"description\\\\\\":\\\\\\"Inhalt: Selektier- und abfragbare Vektordatenrepräsentation der Wuppertaler Flurstücke und Gebäude aus dem Amtlichen Liegenschaftskataster-Informationssystem ALKIS mit der Amtlichen Basiskarte (ABK) als Hintergrund; frei definierte schwarze Strichdarstellung ohne Bezug zum Signaturenkatalog NRW. Verwendungszweck: Schnelle und einfache Entnahme von Informationen zu den ALKIS-Flurstücken und -Gebäuden für Grundstückseigentümer/innen und Teilnehmer/innen am Wuppertaler Immobilienmarkt; direkter Übergang zur gebührenpflichtigen Online-Bestellung von Liegenschaftskarten.\\\\\\",\\\\\\"title\\\\\\":\\\\\\"ABK mit Flurstücken und Gebäuden aus Flurkarte\\\\\\",\\\\\\"type\\\\\\":\\\\\\"collection\\\\\\",\\\\\\"thumbnail\\\\\\":\\\\\\"https://geoportal-files.cismet.de/1756896874603-ABK_mit_Flurst%C3%BCcken.png\\\\\\",\\\\\\"path\\\\\\":\\\\\\"Basis\\\\\\",\\\\\\"serviceName\\\\\\":\\\\\\"discoverBasis\\\\\\",\\\\\\"tags\\\\\\":[\\\\\\"ABK\\\\\\",\\\\\\"Amtliche Basiskarte\\\\\\",\\\\\\"Liegenschaftskataster\\\\\\",\\\\\\"Flurstück\\\\\\",\\\\\\"Flurstücksnummer\\\\\\",\\\\\\"Gebäude\\\\\\",\\\\\\"Bauwerk\\\\\\"],\\\\\\"backgroundLayer\\\\\\":{\\\\\\"title\\\\\\":\\\\\\"Amtliche Basiskarte\\\\\\",\\\\\\"id\\\\\\":\\\\\\"karte\\\\\\",\\\\\\"opacity\\\\\\":0.7,\\\\\\"description\\\\\\":\\\\\\"\\\\\\",\\\\\\"inhalt\\\\\\":\\\\\\"<span>Kartendienst (WMS) der Stadt Wuppertal. Datengrundlage: Amtliche Basiskarte ABK, farbige Ausprägung, wöchentlich in einem automatisierten Prozess aus dem Fachverfahren ALKIS des Liegenschaftskatasters abgeleitet. © Stadt Wuppertal (</span>\\\\\\\\n              <a class=\\\\\\\\\\\\\\"remove-margins\\\\\\\\\\\\\\" href=\\\\\\\\\\\\\\"https://www.govdata.de/dl-de/zero-2-0\\\\\\\\\\\\\\">Datenlizenz Deutschland - Zero - Version 2.0</a>\\\\\\\\n              <span>).</span>\\\\\\",\\\\\\"eignung\\\\\\":\\\\\\"Die Amtliche Basiskarte ABK ist ein Kartenprodukt, das aus dem Amtlichen Liegenschaftskatasterinformationssystem ALKIS abgeleitet ist. Neben einer detaillierten Darstellung der Gebäude werden daher auch die Grundstücksgrenzen dargestellt. Damit eignet sich die ABK insbesondere als Hintergrund für gebäude- und grundstücksbezogene Fachdaten sowie planungsrechtliche Darstellungen. Aktualität: der Gebäudebestand ist durch die wöchentliche Ableitung der Karten aus dem ALKIS-Datenbestand sehr aktuell. Die Identifikation der Gebäude ist mit etwas Aufwand verbunden, da nur ausgewählte Hausnummern dargestellt werden.\\\\\\",\\\\\\"visible\\\\\\":true,\\\\\\"layerType\\\\\\":\\\\\\"wmts\\\\\\",\\\\\\"props\\\\\\":{\\\\\\"name\\\\\\":\\\\\\"\\\\\\",\\\\\\"url\\\\\\":\\\\\\"https://geodaten.metropoleruhr.de/spw2?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=spw2_light&STYLE=default&FORMAT=image/png&TILEMATRIXSET=webmercator_hq&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}\\\\\\"},\\\\\\"layers\\\\\\":\\\\\\"amtlichBasiskarte@90\\\\\\"},\\\\\\"layers\\\\\\":[{\\\\\\"title\\\\\\":\\\\\\"ALKIS Flurstücke / Gebäude (schwarz)\\\\\\",\\\\\\"id\\\\\\":\\\\\\"wwuppKarten:expsw\\\\\\",\\\\\\"layerType\\\\\\":\\\\\\"vector\\\\\\",\\\\\\"opacity\\\\\\":1,\\\\\\"description\\\\\\":\\\\\\"Inhalt: Tagesaktuelle Vektordaten der Flurstücke und Gebäude aus dem Amtlichen Liegenschaftskataster-Informationssystem ALKIS der Stadt Wuppertal; frei definierte schwarze Strichdarstellung ohne Bezug zum Signaturenkatalog NRW, geeignet als Überlagerung einer Luftbildkarte. Nutzung: Frei innerhalb der Grenzen des Urheberrechtsgesetzes; die zugrunde liegenden Datensätze sind mit Wochenaktualität unter einer Open-Data-Lizenz (dl-zero-de/2.0) verfügbar.\\\\\\",\\\\\\"conf\\\\\\":{\\\\\\"blockLegacyGetFeatureInfo\\\\\\":\\\\\\"\\\\\\",\\\\\\"opendata\\\\\\":\\\\\\"https://offenedaten-wuppertal.de/search/topic/layer-flurst%C3%BCcke-und-geb%C3%A4ude-1175\\\\\\",\\\\\\"infoboxMapping\\\\\\":[\\\\\\"function createInfoBoxInfo(p) { const gemarkungen = { 3001: \'Barmen\', 3485: \'Beyenburg\', 3279: \'Cronenberg\', 3278: \'Dönberg\', 3135: \'Elberfeld\', 3486: \'Langerfeld\', 3487: \'Nächstebreck\', 3267: \'Ronsdorf\', 3276: \'Schöller\', 3277: \'Vohwinkel\' }; const isFlurstueck = ( p.carmaInfo?.sourceLayer === \'landparcel\' || p.carmaInfo?.selectionForwardingTo?.includes(\'landparcel\') ); const isGebaeude =( p.carmaInfo?.sourceLayer === \'building\' || p.carmaInfo?.selectionForwardingTo?.includes(\'building\') ); const isGebaeudestruktur =( p.carmaInfo?.sourceLayer === \'buildingstructure\' || p.carmaInfo?.selectionForwardingTo?.includes(\'buildingstructure\') ); if (isFlurstueck) { const landparcel=p.targetProperties || p; return { headerColor: \'#000000\', header: \'Flurstück\', title: `${landparcel.gemarkungsnummer}-${landparcel.flurnummer}-${landparcel.zaehler}/${landparcel.nenner ? landparcel.nenner : \'0\'}`, additionalInfo: `<html>` + `Gemarkung: ${gemarkungen[landparcel.gemarkungsnummer]} (${landparcel.gemarkungsnummer})<br/>` + `Flur: ${landparcel.flurnummer}<br/>` + `Flurstück: ${landparcel.zaehler}${landparcel.nenner ? \'/\' + landparcel.nenner : \'\'}` + `</html>`, subtitle: `<html>` + `Adresse: ${landparcel.adresse}<br/>` + `Fläche: ${landparcel.flaeche_m2} m²` + `</html>`, genericLinks: [{ tooltip: \'Bestellung von Liegenschaftskarten\', url: `https://formulare.wuppertal.de/metaform/Form-Solutions/sid/assistant/5587cff10cf2ac88b8a11a72?Antragsteller.Daten.Auswahl%20%C3%BCber=Flurst%C3%BCck&Antragsteller.Daten.GeoLocation2.Gemarkung=${gemarkungen[landparcel.gemarkungsnummer]}%20(${landparcel.gemarkungsnummer})&Antragsteller.Daten.GeoLocation2.Flurnummer=${landparcel.flurnummer}&Antragsteller.Daten.GeoLocation2.Flurst%C3%BCck=${landparcel.zaehler}${landparcel.nenner ? \'%2F\'+landparcel.nenner : \'\'}`, iconname: \'shopping-cart\' }] }; } else if (isGebaeude) { const geb=p.targetProperties || p; return { headerColor: \'#000000\', header: `${geb.geb_typ.trim()==\'Hauptgebäude\'?\'Hauptgebäude\':geb.geb_typ.replaceAll(\'_\', \' \')}`, title: `${geb.strname} ${geb.hnr?(geb.hnr===\'mehrere\'?\'(mehrere)\':geb.hnr):(geb.hausnr?geb.hausnr+\' \'+geb.adr_zusatz.trim():\'\')}`, additionalInfo: `<html>` + `Funktion: ${geb.geb_fkt}<br/>` + `Grundfläche: ${geb.flaeche} m²<br/>` + `</html>`, subtitle: `<html>` + `${geb.oeffentl==\'1\'?\'Öffentliches Gebäude\':\'\'}` + `</html>` }; }else if (isGebaeudestruktur) { const gebs=p.targetProperties || p; return { headerColor: \'#000000\', header: \'Bauwerk\', title: `${gebs.funktion_txt}`, }; } else { return null; } }\\\\\\"]},\\\\\\"queryable\\\\\\":true,\\\\\\"useInFeatureInfo\\\\\\":true,\\\\\\"visible\\\\\\":true,\\\\\\"props\\\\\\":{\\\\\\"style\\\\\\":\\\\\\"https://tiles.cismet.de/alkis/flurstuecke.black.style.json\\\\\\",\\\\\\"minZoom\\\\\\":13,\\\\\\"maxZoom\\\\\\":24,\\\\\\"legend\\\\\\":[{\\\\\\"Format\\\\\\":\\\\\\"image/png\\\\\\",\\\\\\"OnlineResource\\\\\\":\\\\\\"https://www.wuppertal.de/geoportal/legenden/default_R102_ALKIS_Vektor_FlstGeb_schwarz.png\\\\\\",\\\\\\"size\\\\\\":[231,358]}]},\\\\\\"other\\\\\\":{\\\\\\"replaceId\\\\\\":\\\\\\"wuppKarten:expsw\\\\\\",\\\\\\"title\\\\\\":\\\\\\"ALKIS Flurstücke / Gebäude (schwarz)\\\\\\",\\\\\\"description\\\\\\":\\\\\\"Inhalt: Tagesaktuelle Vektordaten der Flurstücke und Gebäude aus dem Amtlichen Liegenschaftskataster-Informationssystem ALKIS der Stadt Wuppertal; frei definierte schwarze Strichdarstellung ohne Bezug zum Signaturenkatalog NRW, geeignet als Überlagerung einer Luftbildkarte. Nutzung: Frei innerhalb der Grenzen des Urheberrechtsgesetzes; die zugrunde liegenden Datensätze sind mit Wochenaktualität unter einer Open-Data-Lizenz (dl-zero-de/2.0) verfügbar.\\\\\\",\\\\\\"tags\\\\\\":[\\\\\\"Basis\\\\\\",\\\\\\"Liegenschaftskataster\\\\\\",\\\\\\"Flurstück\\\\\\",\\\\\\"Flurstücksnummer\\\\\\",\\\\\\"Gebäude\\\\\\",\\\\\\"Bauwerk\\\\\\"],\\\\\\"keywords\\\\\\":[\\\\\\"carmaconf://infoBoxMapping:function createInfoBoxInfo(p) { const gemarkungen = { 3001: \'Barmen\', 3485: \'Beyenburg\', 3279: \'Cronenberg\', 3278: \'Dönberg\', 3135: \'Elberfeld\', 3486: \'Langerfeld\', 3487: \'Nächstebreck\', 3267: \'Ronsdorf\', 3276: \'Schöller\', 3277: \'Vohwinkel\' }; const isFlurstueck = ( p.carmaInfo?.sourceLayer === \'landparcel\' || p.carmaInfo?.selectionForwardingTo?.includes(\'landparcel\') ); const isGebaeude =( p.carmaInfo?.sourceLayer === \'building\' || p.carmaInfo?.selectionForwardingTo?.includes(\'building\') ); const isGebaeudestruktur =( p.carmaInfo?.sourceLayer === \'buildingstructure\' || p.carmaInfo?.selectionForwardingTo?.includes(\'buildingstructure\') ); if (isFlurstueck) { const landparcel=p.targetProperties || p; return { headerColor: \'#000000\', header: \'Flurstück\', title: `${landparcel.gemarkungsnummer}-${landparcel.flurnummer}-${landparcel.zaehler}/${landparcel.nenner ? landparcel.nenner : \'0\'}`, additionalInfo: `<html>` + `Gemarkung: ${gemarkungen[landparcel.gemarkungsnummer]} (${landparcel.gemarkungsnummer})<br/>` + `Flur: ${landparcel.flurnummer}<br/>` + `Flurstück: ${landparcel.zaehler}${landparcel.nenner ? \'/\' + landparcel.nenner : \'\'}` + `</html>`, subtitle: `<html>` + `Adresse: ${landparcel.adresse}<br/>` + `Fläche: ${landparcel.flaeche_m2} m²` + `</html>`, genericLinks: [{ tooltip: \'Bestellung von Liegenschaftskarten\', url: `https://formulare.wuppertal.de/metaform/Form-Solutions/sid/assistant/5587cff10cf2ac88b8a11a72?Antragsteller.Daten.Auswahl%20%C3%BCber=Flurst%C3%BCck&Antragsteller.Daten.GeoLocation2.Gemarkung=${gemarkungen[landparcel.gemarkungsnummer]}%20(${landparcel.gemarkungsnummer})&Antragsteller.Daten.GeoLocation2.Flurnummer=${landparcel.flurnummer}&Antragsteller.Daten.GeoLocation2.Flurst%C3%BCck=${landparcel.zaehler}${landparcel.nenner ? \'%2F\'+landparcel.nenner : \'\'}`, iconname: \'shopping-cart\' }] }; } else if (isGebaeude) { const geb=p.targetProperties || p; return { headerColor: \'#000000\', header: `${geb.geb_typ.trim()==\'Hauptgebäude\'?\'Hauptgebäude\':geb.geb_typ.replaceAll(\'_\', \' \')}`, title: `${geb.strname} ${geb.hnr?(geb.hnr===\'mehrere\'?\'(mehrere)\':geb.hnr):(geb.hausnr?geb.hausnr+\' \'+geb.adr_zusatz.trim():\'\')}`, additionalInfo: `<html>` + `Funktion: ${geb.geb_fkt}<br/>` + `Grundfläche: ${geb.flaeche} m²<br/>` + `</html>`, subtitle: `<html>` + `${geb.oeffentl==\'1\'?\'Öffentliches Gebäude\':\'\'}` + `</html>` }; }else if (isGebaeudestruktur) { const gebs=p.targetProperties || p; return { headerColor: \'#000000\', header: \'Bauwerk\', title: `${gebs.funktion_txt}`, }; } else { return null; } }\\\\\\",\\\\\\"carmaconf://blockLegacyGetFeatureInfo\\\\\\",\\\\\\"carmaConf://opendata:https://offenedaten-wuppertal.de/search/topic/layer-flurst%C3%BCcke-und-geb%C3%A4ude-1175\\\\\\"],\\\\\\"id\\\\\\":\\\\\\"wwuppKarten:expsw\\\\\\",\\\\\\"name\\\\\\":\\\\\\"expsw\\\\\\",\\\\\\"type\\\\\\":\\\\\\"layer\\\\\\",\\\\\\"layerType\\\\\\":\\\\\\"vector\\\\\\",\\\\\\"queryable\\\\\\":true,\\\\\\"maxZoom\\\\\\":24,\\\\\\"minZoom\\\\\\":14,\\\\\\"path\\\\\\":\\\\\\"Basis\\\\\\",\\\\\\"pictureBoundingBox\\\\\\":[784874.5156892611,6655868.893474152,821182.1041247197,6679927.448126909],\\\\\\"icon\\\\\\":\\\\\\"basis/ALKIS_Flurstuecke_Gebaude_schwarz\\\\\\",\\\\\\"thumbnail\\\\\\":\\\\\\"https://tiles.cismet.de/alkis/assets/alkis_flurstuecke_schwarz.png\\\\\\",\\\\\\"vectorStyle\\\\\\":\\\\\\"https://tiles.cismet.de/alkis/flurstuecke.black.style.json\\\\\\",\\\\\\"serviceName\\\\\\":\\\\\\"wuppKarten\\\\\\",\\\\\\"layerName\\\\\\":\\\\\\"expsw\\\\\\"}}],\\\\\\"id\\\\\\":\\\\\\"12\\\\\\",\\\\\\"isDraft\\\\\\":true}\\", \\"draft\\" : false}]","version":"version","time":"2025-12-19 14:21:45.1699","status":200}',
        },
      });
    }
  );
}
