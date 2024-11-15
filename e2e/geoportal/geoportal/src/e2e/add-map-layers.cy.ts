describe("Geoportal add map layers", () => {
  beforeEach(() => {
    // cy.intercept(
    //   "GET",
    //   "**/karten?&service=WMS&request=GetMap&layers=spw2_orange*"
    // ).as("wmsRequest");
    cy.visit("/");
    cy.waitForNetworkIdlePrepare({
      method: "GET",
      pattern:
        "https://maps.wuppertal.de/karten?&service=WMS&request=GetMap&layers=spw2_orange*",
      alias: "wmsRequest",
    });
  });

  const checkTilesForLayer = (expectedLayer: string) => {
    cy.get("img.leaflet-tile.leaflet-tile-loaded")
      .should("have.length.greaterThan", 0)
      .then(($tiles) => {
        const found = Array.from($tiles).some(($img) => {
          const src = $img.getAttribute("src");

          if (src && src.includes(expectedLayer)) {
            console.log("xxx layer was found", src);
          } else {
            console.log("xxx layer was not found");
          }
          return src && src.includes(expectedLayer);
        });

        expect(found, `Tiles with layer "${expectedLayer}" should be added`).to
          .be.true;
      });
  };

  it("Search shows only related layer, layers are added to map and to the favorite section", () => {
    cy.get("[data-test-id=kartenebenen-hinzufügen-btn]").should("be.visible");
    cy.get("[data-test-id=kartenebenen-hinzufügen-btn]").click();
    cy.get(".ant-modal-content").should("be.visible");
    cy.get("[data-test-id=card-layer-prev]").should("be.visible");
    cy.get("[data-test-id=card-layer-prev]").should(
      "have.length.greaterThan",
      8
    );

    cy.get("[data-test-id=card-layer-prev]").should("be.visible");

    cy.get(".Favoriten").should("not.exist");

    cy.get("[data-test-id=card-layer-prev]")
      .contains("SPW2 Orange")
      .should("exist")
      .parents('[data-test-id="card-layer-prev"]')
      .as("flayer-gelp");

    cy.get("@flayer-gelp")
      .find("[data-test-id=add-layer-favorite]")
      .should("exist")
      .click();

    cy.get("#Favoriten").should("exist");
    cy.get("#Favoriten")
      .find('[data-test-id="card-layer-prev"]')
      .should("exist");

    cy.get("@flayer-gelp")
      .find("[data-test-id=remove-layer-favorite]")
      .should("exist")
      .click();

    cy.get("#Favoriten").should("not.exist");

    cy.get("@flayer-gelp")
      .find("[data-test-id=apply-layer-to-map]")
      .should("exist")
      .click();

    // cy.wait("@wmsRequest");
    // cy.wait(6000);

    cy.waitForNetworkIdle("@wmsRequest", 8000);
    // Cypress._.times(20, () => {
    //   cy.waitForNetworkIdle("@wmsRequest", 5000);
    // });
    checkTilesForLayer("spw2_orange");

    cy.get(".ant-modal-content")
      .find("input")
      .should("be.visible")
      .type("Expresskarte");

    cy.get("[data-test-id=card-layer-prev]").should(
      "have.length.greaterThan",
      2
    );
    cy.get(".anticon.anticon-close-circle").click();

    cy.get("[data-test-id=card-layer-prev]").should(
      "have.length.greaterThan",
      20
    );

    cy.get(".leaflet-layer").find("div").should("exist");
    cy.get(".leaflet-layer").find("div").find("img").should("exist");

    cy.get("@flayer-gelp")
      .find("[data-test-id=apply-layer-to-map]")
      .should("exist")
      .click();
  });
});
