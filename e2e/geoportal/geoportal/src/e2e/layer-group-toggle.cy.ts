describe("Geoportal layer group icon", () => {
  beforeEach(() => {
    cy.visit("/");
  });

  it("Toggle visibility of layer group button", () => {
    cy.get("[data-test-id=kartensteuerelemente-btn]").should("be.visible");
    cy.get("#layer-karte").should("be.visible");
    cy.get("[data-test-id=kartensteuerelemente-btn]").click();
    cy.get("layer-karte").should("not.exist");
    cy.get("[data-test-id=kartensteuerelemente-btn]").click();
    cy.get("#layer-karte").should("be.visible");
  });
});
