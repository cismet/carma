import { test, expect } from "@playwright/test";
import { setupAllMocks, mockGeoportalServices } from "@carma-commons/e2e";
import {
  expectLayerTagsNotVisibleAfterClick,
  expectLayerTagsVisible,
  layersNamesArr,
  loadMapLayerAndCloseDialog,
  navigateToMapLayersDialog,
  removeMapLayer,
  setupCommonLayerMocks,
  urlWithMapLayers,
} from "../utils/layers";

const userResMock = {
  user: "cismet",
  domain: "WUNDA_BLAU",
  jwt: "some-jwt",
  passHash: "some-passHash",
  userGroups: [
    "__Rat",
    "_402.25",
    "_ALKIS_Buttler",
    "_ALKIS_Druck",
    "_ALKIS_Eigentümer",
    "_ALKIS_erweitere_Produkte",
    "_ALKIS_Flurstücke",
    "_ALKIS_interne_Produkte",
    "_ALKIS_NAS",
    "_ALKIS_Nivellementpkt_SCHREIBEN",
    "_ALKIS_Punkte",
    "_ALKIS_Vermessungsriss",
    "_ALKIS_Vermessungsriss_SCHREIBEN",
    "_AlLuftbild_LESEN",
    "_AlLuftbild_SCHREIBEN",
    "_Altlasten_LESEN",
    "_Altlasten_SCHREIBEN",
    "_Anwohner_LESEN",
    "_Anwohner_SCHREIBEN",
    "_Apotheken_SCHREIBEN",
    "_Auftragsbuch",
    "_Auftragsbuch_SCHREIBEN",
    "_Bahnflächen_SCHREIBEN",
    "_BASICS_Interne_Nutzer",
    "_Baulasten_BESCHEINIGUNG",
    "_Baulasten_FINAL_CHECK",
    "_Baulasten_LESEN",
    "_Baulasten_SCHREIBEN",
    "_Baulasten_SEHEN",
    "_Baum_LESEN",
    "_Baum_SCHREIBEN",
    "_Baustellen_SCHREIBEN",
    "_Berechtigungspruefung_KUNDE",
    "_Berechtigungspruefung_LESEN",
    "_Berechtigungspruefung_SCHREIBEN",
    "_Berechtigungspruefung_SEHEN",
    "_Billing_intern",
    "_Bodenverkehr_SCHREIBEN",
    "_Brach_Monitor_SCHREIBEN",
    "_Brachflächen_LESEN",
    "_Brachflächen_SCHREIBEN",
    "_Brücken_LESEN",
    "_Brücken_SCHREIBEN",
    "_ClientPrint_Big",
    "_Digitalfunk_SCHREIBEN",
    "_Emobil_SCHREIBEN",
    "_Erdloch_SCHREIBEN",
    "_ESW_Handstreustellen_SCHREIBEN",
    "_Externe_Unternehmen_WV_Mauern",
    "_FNP_Flächenkataster",
    "_FNP_Flächenkataster_SCHREIBEN",
    "_FS_Produkt_Bestellung",
    "_FUNDSTELLEN",
    "_Geoportal_Publizieren",
    "_Grundwassermessstelle_LESEN",
    "_Grundwassermessstelle_SCHREIBEN",
    "_Grundwassermessung_LESEN",
    "_Grundwassermessung_SCHREIBEN",
    "_Gutachterausschuss",
    "_HERE",
    "_HOEHLEN-STOLLEN",
    "_HTTPTunnelUser",
    "_Kehrbezirk_SCHREIBEN",
    "_Kita_SCHREIBEN",
    "_Klima_LESEN",
    "_Klima_SCHREIBEN",
    "_Klimaort",
    "_Kompensationskataster",
    "_Kompensationskataster_SCHREIBEN",
    "_Luftbild_SA_SCHREIBEN",
    "_Mauern_ADMIN",
    "_Mauern_LESEN",
    "_Mauern_SCHREIBEN",
    "_NO2_LESEN",
    "_NO2_SCHREIBEN",
    "_OrbitViewer",
    "_Pflege_St_Flurstuecke_LESEN",
    "_Pflege_St_Flurstuecke_SCHREIBEN",
    "_Pflegeeinrichtungen_Lesen",
    "_Pflegeeinrichtungen_SCHREIBEN",
    "_Poi-Administration",
    "_Point_of_Interest_LESEN",
    "_Point_of_Interest_SCHREIBEN",
    "_Potenzialflaechen_LESEN",
    "_Potenzialflaechen_LESEN_EXT",
    "_Potenzialflaechen_PUBLIC",
    "_Potenzialflaechen_SCHREIBEN",
    "_PrBr_SCHREIBEN",
    "_PSA_SCHREIBEN",
    "_PUBLIC",
    "_Punktnummern_MASTER",
    "_Punktnummernfreigabe",
    "_Punktnummernreservierung",
    "_Punktnummernverlängern",
    "_Qsgeb_HIST_LESEN",
    "_Qsgeb_HIST_SCHREIBEN",
    "_Qsgeb_LESEN",
    "_Qsgeb_SCHREIBEN",
    "_Schrottimmobilien_LESEN",
    "_Schrottimmobilien_SCHREIBEN",
    "_Schulung",
    "_Spielhallen_SCHREIBEN",
    "_Spst_LESEN",
    "_Spst_SCHREIBEN",
    "_Stadtbilder_LESEN",
    "_Stadtbilder_SCHREIBEN",
    "_Starkregen_Hinweise_SCHREIBEN",
    "_STR_ADR_LESEN",
    "_STR_ADR_SCHREIBEN",
    "_Straßensatzung_LESEN",
    "_Straßensatzung_SCHREIBEN",
    "_TESTKLASSE_GEOMETRIEN",
    "_TIM_Liegr_SCHREIBEN",
    "_TREPPEN_LESEN",
    "_TREPPEN_SCHREIBEN",
    "_TRINKWASSER_SCHREIBEN",
    "_Umweltalarm",
    "_Umweltalarm_LESEN",
    "_Umweltalarm_MASTER",
    "_Umweltalarm_SCHREIBEN",
    "_Verkehrszeichen_LESEN",
    "_Verkehrszeichen_SCHREIBEN",
    "_Verschmelzungsverbot_WMS",
    "_VirtualCityMap",
    "_Vorhabenkarte_KARTO",
    "_Vorhabenkarte_LESEN",
    "_Vorhabenkarte_MASTER",
    "_Vorhabenkarte_SCHREIBEN",
    "_WC_SCHREIBEN",
    "_WiFoe-Unternehmensstandorte",
    "_Wmarkt_SCHREIBEN",
    "_Wohnungsbauförderung_SCHREIBEN",
    "_WSW_Unterhaltungsgrenzen",
    "Administratoren",
    "anonymous",
    "cids",
    "Formsolutions",
    "POT_WOHNEN_LESEN",
    "POT_WOHNEN_SCHREIBEN",
    "Potenzialflaechen_POLITIK",
    "TZ_Baumbewirtschaftung",
    "VermessungsunterlagenportalNRW",
    "WSW",
    "XXX_gekuendigte_OebVI",
    "xxx_UserLoeschen",
  ],
};

const saveMapMock = {
  contentType: "application/octet-stream",
  res: '{"id": "18"}',
};
test.describe("Geoportal - Save map with authorization", () => {
  test.beforeEach(async ({ context, page }) => {
    await setupAllMocks(context);
    await mockGeoportalServices(context);
    await setupCommonLayerMocks(page);

    await context.route("https://wunda-cloud-api.cismet.de/users", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(userResMock),
      })
    );

    await context.route(
      "https://wunda-cloud-api.cismet.de/actions/WUNDA_BLAU.SaveObject/tasks?resultingInstanceType=result",
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(saveMapMock),
        })
    );

    // Mock for fetching published maps in "Entdecken" section
    await context.route(
      "https://wunda-cloud-api.cismet.de/actions/WUNDA_BLAU.dataAquisition/tasks?resultingInstanceType=result",
      async (route) => {
        await route.fulfill({
          json: {
            contentType: "application/octet-stream",
            res: '{"status":200,"md5":"test","content":"[{\\"id\\":18,\\"name\\":\\"Kita title\\",\\"config\\":\\"{\\\\\\"title\\\\\\":\\\\\\"Kita title\\\\\\",\\\\\\"description\\\\\\":\\\\\\"Test content\\\\\\",\\\\\\"type\\\\\\":\\\\\\"collection\\\\\\",\\\\\\"serviceName\\\\\\":\\\\\\"discoverPoi\\\\\\",\\\\\\"thumbnail\\\\\\":\\\\\\"https://example.com/thumb.png\\\\\\",\\\\\\"path\\\\\\":\\\\\\"\\\\\\",\\\\\\"layers\\\\\\":[]}\\",\\"draft\\":null}]"}',
          },
        });
      }
    );

    await page.goto(urlWithMapLayers);
  });

  test("Save map with authorization", async ({ page }) => {
    await expectLayerTagsVisible(page, layersNamesArr);
    const addLayersBtn = page.getByTestId("kartenebenen-hinzufügen-btn");
    await expect(addLayersBtn).toBeVisible();
    const menu = page.getByTestId("modal-menu-btn");
    await expect(menu).toBeVisible();
    await menu.click();
    await expect(
      page.getByText("Kompaktanleitung und Hintergrundinformationen")
    ).toBeVisible();

    const authIcon = page.getByRole("button").filter({ hasText: /^$/ });
    await expect(authIcon).toBeVisible();
    await authIcon.click();
    const userNane = page.getByRole("textbox", { name: "WuNDa Benutzername" });
    await userNane.fill("xxx");
    const password = page.getByRole("textbox", { name: "Passwort" });
    await password.fill("xxx");
    const regBtn = page.getByRole("button", { name: "Anmeldung", exact: true });
    await expect(regBtn).toBeVisible();
    await regBtn.click();
    await expect(regBtn).not.toBeVisible();

    const shareBtn = page.getByTestId("teilen-btn");
    await expect(shareBtn).toBeVisible();
    await shareBtn.click();

    // Go to share modal
    await expect(page.getByText("Karte teilen")).toBeVisible();
    const titelInput = page.getByRole("textbox", { name: "Titel *" });
    await expect(titelInput).toBeVisible();
    await titelInput.fill("Kita title");
    const content = page.getByRole("textbox", { name: "Inhalt *" });
    await expect(content).toBeVisible();
    await content.scrollIntoViewIfNeeded();
    await content.fill("Test content");
    const purpose = page.getByRole("textbox", { name: "Verwendungszweck *" });

    await purpose.scrollIntoViewIfNeeded();
    await expect(purpose).toBeVisible();
    await purpose.fill("Test purpose");

    const publicBtn = page.getByRole("button", { name: "Publizieren" });
    await expect(publicBtn).toBeVisible();
    await publicBtn.click();
    await expect(publicBtn).not.toBeVisible({ timeout: 15000 });

    const saveMapBtn = page.getByTestId("speichern-btn");
    await expect(saveMapBtn).toBeVisible({ timeout: 15000 });

    // close layers tags
    await expectLayerTagsNotVisibleAfterClick(page, layersNamesArr);

    // Go to Entdecken
    const entdeckenBtn = page.getByText("Entdecken");
    await navigateToMapLayersDialog(page, addLayersBtn, entdeckenBtn);
    // const kitaCardTitle = page.getByText("Kita title");
    const kitaCardTitle = page.getByRole("heading", { name: "Kita title" });
    await expect(kitaCardTitle).toBeVisible({ timeout: 15000 });
    await loadMapLayerAndCloseDialog(page, kitaCardTitle);
    await navigateToMapLayersDialog(page, addLayersBtn, entdeckenBtn);
    await removeMapLayer(page);
  });
});
