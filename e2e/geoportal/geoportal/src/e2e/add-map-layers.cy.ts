describe("Geoportal add map layers", () => {
  beforeEach(() => {
    cy.intercept(
      "GET",
      "**/karten?&service=WMS&request=GetMap&layers=spw2_orange*"
    ).as("wmsRequest");
    cy.visit("/");
  });

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

    cy.wait("@wmsRequest");

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

    // cy.get("[data-test-id=add-layer-to-map-close-btn]").should("be.visible");
    // cy.get("[data-test-id=add-layer-to-map-close-btn]").click();

    cy.get("img.leaflet-tile.leaflet-tile-loaded").each(($img, k) => {
      const src = $img.attr("src");
      let ifSpw2Orange = false;

      if (src && src.includes("spw2_orange")) {
        console.log("xxx src", k);
        ifSpw2Orange = true;
      } else {
        console.log("xxx src not found");
      }
    });
  });
});
