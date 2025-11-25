import { test, expect } from "@playwright/test";
import { setupAllMocks, mockOMTMapHosting } from "@carma-commons/e2e";

test.describe("verkehrszeichenkataster smoke test", () => {
  test("main page show map, menu, cards, combo boxes after authorisation", async ({
    page,
    context,
  }) => {
    // Navigate to the application
    await setupAllMocks(context);
    await mockOMTMapHosting(context);
    await context.route(
      "https://wunda-cloud.cismet.de/wunda/api/graphql/WUNDA_BLAU/execute",
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: "[]",
        })
    );

    await context.route(
      "https://unpkg.com/@excalidraw/excalidraw@0.17.6/dist/excalidraw-assets-dev/vendor-39727f4653a274cf18f6.js",
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: "[]",
        })
    );

    await context.route(
      "https://wunda-cloud.cismet.de/wunda/api/users",
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            user: "cismet",
            domain: "WUNDA_BLAU",
            jwt: "0000000",
            passHash: "0000000",
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
              "_VORHABEN_LESEN",
              "_VORHABEN_SCHREIBEN",
              "_Vorhabenkarte_KARTO",
              "_Vorhabenkarte_LESEN",
              "_Vorhabenkarte_MASTER",
              "_Vorhabenkarte_SCHREIBEN",
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
              "VermessungsunterlagenportalNRW",
              "WSW",
              "XXX_gekuendigte_OebVI",
              "xxx_UserLoeschen",
            ],
          }),
        })
    );

    await page.goto("/");
    // Perform authentication
    await page.locator("#username").fill("cismet");
    await page.fill('input[type="password"]', "cismet");
    await page.click(".ant-btn");

    // Wait for authentication and page load
    await page.waitForTimeout(5000);

    // Check for "Karte" text
    await expect(page.locator("text=Karte")).toBeVisible();

    // Logout - the button has the image/SVG element, .locator("path") looks for a child element <path> inside it
    await page.getByRole("img", { name: "logout" }).locator("path").click();
  });
});
