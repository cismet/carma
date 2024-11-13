describe("geoportal smoke test", () => {
  beforeEach(() => cy.visit("/"));

  it("Map loads with key controls and buttons", () => {
    cy.get("[data-test-id=helper-overlay-btn]").should("be.visible");
    cy.get("[data-test-id=helper-overlay-btn]").click();
    cy.get("[data-test-id=overlay-helper-bg]").should("be.visible");
    cy.get("[data-test-id=overlay-helper-primary]").should(
      "have.length.greaterThan",
      5
    );
  });
});
