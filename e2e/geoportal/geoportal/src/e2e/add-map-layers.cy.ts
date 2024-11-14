describe("Geoportal add map layers", () => {
  beforeEach(() => {
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

    // cy.get(".ant-modal-content")
    //   .find("input")
    //   .should("be.visible")
    //   .type("Expresskarte");
    // cy.get(".anticon.anticon-close-circle").click();

    cy.get("[data-test-id=card-layer-prev]").should("be.visible");

    cy.get(".Favoriten").should("not.exist");

    cy.get("[data-test-id=card-layer-prev]")
      .contains("Expresskarte (Strichkarte gelb)")
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

    // cy.get("@first-prev-layer")
    //   .find("[data-test-id=remove-layer-favorite]")
    //   .should("be.visible ");
  });
});
