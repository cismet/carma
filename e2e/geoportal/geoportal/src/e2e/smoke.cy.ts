describe("geoportal smoke test", () => {
  beforeEach(() => cy.visit("/"));

  it("Map loads with key controls and buttons", () => {
    cy.get("[data-test-id=zoom-in-control]").should("be.visible");
    cy.get("[data-test-id=zoom-out-control]").should("be.visible");
    cy.get("[data-test-id=full-screen-control]").should("be.visible");
    cy.get("[data-test-id=location-control]").should("be.visible");
    cy.get("[data-test-id=home-control]").should("be.visible");
    cy.get("[data-test-id=measurement-control]").should("be.visible");
    cy.get("[data-test-id=3d-control]").should("be.visible");
    cy.get("[data-test-id=2d-control]").should("not.exist");
    cy.get("[data-test-id=compass-control]").should("be.visible");
    cy.get("[data-test-id=feature-info-control]").should("be.visible");
    cy.get("[data-test-id=helper-overlay-btn]").should("be.visible");
    cy.get("[data-test-id=modal-menu-btn]").should("be.visible");
    cy.get("[data-test-id=reload-btn]").should("be.visible");
    cy.get("[data-test-id=kartenebenen-hinzufügen-btn]").should("be.visible");
    cy.get("[data-test-id=hintergrundkarte-btn]").should("be.visible");
    cy.get("[data-test-id=kartensteuerelemente-btn]").should("be.visible");
    cy.get("[data-test-id=speichern-btn]").should("be.visible");
    cy.get("[data-test-id=teilen-btn]").should("be.visible");
  });
});
