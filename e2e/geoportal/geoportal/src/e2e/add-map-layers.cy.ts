describe("Geoportal add map layers", () => {
  beforeEach(() => {
    cy.visit("/");
  });

  it("Search shows only related layer, layers are added to map and the favorite section", () => {
    cy.get("[data-test-id=kartenebenen-hinzufügen-btn]").should("be.visible");
    cy.get("[data-test-id=kartenebenen-hinzufügen-btn]").click();
    cy.get(".ant-modal-content").should("be.visible");
    cy.get("[data-test-id=card-layer-prev]").should("be.visible");
    cy.get("[data-test-id=card-layer-prev]").should(
      "have.length.greaterThan",
      8
    );
    cy.get(".ant-modal-content")
      .find("input")
      .should("be.visible")
      .type("Expresskarte");

    cy.get("[data-test-id=card-layer-prev]").should("be.visible");

    cy.get(".anticon.anticon-close-circle").click();
    cy.get("[data-test-id=card-layer-prev]")
      .first()
      .find("[data-test-id=add-layer-favorite]")
      .should("be.visible")
      .click();
  });
});
