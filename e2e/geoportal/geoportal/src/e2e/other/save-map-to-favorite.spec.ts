import { test, expect } from "@playwright/test";
import { setupAllMocks, mockGeoportalServices } from "@carma-commons/e2e";
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
test.describe("Geoportal - save map to favorite", () => {
  test.beforeEach(async ({ context, page }) => {
    await setupAllMocks(context);
    await mockGeoportalServices(context);
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
    await page.route(
      "https://tiles.cismet.de/kita/style.json",
      async (route) => {
        await route.fulfill({ json: kitaStyleJson });
      }
    );
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

    await page.goto(
      "/#/?lat=51.2586922&lng=7.1510696&zoom=12&config=847e07f9bee9a4f8&appKey=sharedurl"
    );
  });

  test("Save Map dialog — save map with layers to Favorites", async ({
    page,
  }) => {
    // Check map layers and save map button are visible
    const saveMapBtn = page.getByTestId("speichern-btn");
    await expect(saveMapBtn).toBeVisible();
    await saveMapBtn.click();
    const addLayersBtn = page.getByTestId("kartenebenen-hinzufügen-btn");
    await expect(addLayersBtn).toBeVisible();
    const layerTagPlayground = page.getByRole("button", {
      name: "Kinderspielplätze",
    });
    await expect(layerTagPlayground).toBeVisible();
    const layerTagKindergarten = page.getByRole("button", {
      name: "Kindertagesstätten",
    });
    await expect(layerTagKindergarten).toBeVisible();

    // Check dialog content
    const dialogTitle = page.getByRole("heading", { name: "Karte speichern" });
    await expect(dialogTitle).toBeVisible();
    const titleInput = page.getByRole("textbox", { name: "Titel" });
    await titleInput.fill("Kita title");
    const contentInput = page.getByRole("textbox", { name: "Inhalt" });
    await contentInput.fill("Kita content");
    const saveFavoriteBtn = page.getByRole("button", {
      name: "Als Favorit speichern",
    });
    await saveFavoriteBtn.click();

    await expect(dialogTitle).not.toBeVisible();

    // close layers tags
    page.locator('[id="removeLayerButton-wuppPOI\\:poi_ksp"]').click();
    await expect(layerTagPlayground).not.toBeVisible();
    page.locator('[id="removeLayerButton-wuppPOI\\:poi_kita"]').click();
    await expect(layerTagKindergarten).not.toBeVisible();
    const messageAlert = page
      .getByRole("img", { name: "check-circle" })
      .locator("path");
    await expect(messageAlert).toBeVisible();
    await expect(messageAlert).not.toBeVisible();

    // Go to favorites
    await expect(addLayersBtn).toBeVisible();
    addLayersBtn.click();
    const favoriteBtn = page.getByText("Favoriten");
    await expect(favoriteBtn).toBeVisible();
    favoriteBtn.click();

    // Load favorite map
    const kitaCardTitle = page.getByRole("heading", { name: "Kita title" });
    await expect(kitaCardTitle).toBeVisible();
    const loadBtn = page.getByTestId("card-layer-prev").getByRole("button");
    await expect(loadBtn).toBeVisible();
    await loadBtn.click();
    await expect(messageAlert).toBeVisible();
    await expect(messageAlert).not.toBeVisible();
    page.getByTestId("card-layer-prev").getByRole("button");
    const closeDialogBtn = page.getByRole("dialog").getByRole("button").nth(1);
    await expect(closeDialogBtn).toBeVisible();
    await closeDialogBtn.click();
    await expect(kitaCardTitle).not.toBeVisible();
    await expect(layerTagPlayground).toBeVisible();
    await expect(layerTagKindergarten).toBeVisible();

    // Go to favorites
    await expect(addLayersBtn).toBeVisible();
    addLayersBtn.click();
    await expect(favoriteBtn).toBeVisible();
    favoriteBtn.click();
    await expect(kitaCardTitle).toBeVisible();
    const detailsBtn = page
      .getByTestId("card-layer-prev")
      .locator("svg")
      .nth(2);
    await expect(detailsBtn).toBeVisible();
    detailsBtn.click();
    const infoCard = page.getByTestId("card-layer-detailed-info");
    await expect(infoCard).toBeVisible();
    const removeBtn = page
      .getByTestId("card-layer-detailed-info")
      .getByRole("button", { name: "Löschen" });
    await expect(removeBtn).toBeVisible();
    removeBtn.click();
    const popUpAlert = page.getByRole("heading", {
      name: "Zusammenstellung Kita title",
    });
    await expect(popUpAlert).toBeVisible();
    const confirmRemoving = page
      .getByRole("button", { name: "Löschen" })
      .nth(2);
    expect(confirmRemoving).toBeVisible();
    await confirmRemoving.click();
    await expect(popUpAlert).not.toBeVisible();
    await expect(infoCard).not.toBeVisible();
  });
});
