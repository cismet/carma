describe("Geoportal overlay", () => {
  beforeEach(() => cy.visit("/"));

  it("Overlay helper is visible and opens all secondary popups", () => {
    cy.get("[data-test-id=helper-overlay-btn]").should("be.visible");
    cy.get("[data-test-id=helper-overlay-btn]").click();
    cy.get("[data-test-id=overlay-helper-bg]").should("be.visible");
    cy.get("[data-test-id=primary-with-secondary]").should(
      "have.length.greaterThan",
      5
    );
    cy.get(".ant-popover-content").should("not.exist");
    cy.get("[data-test-id=primary-with-secondary]").each(($el) => {
      cy.wrap($el).click({ force: true });
      cy.get(".ant-popover-content").should("be.visible");

      cy.wrap($el).click({ force: true });

      cy.get(".ant-popover-content").should("not.be.visible");
    });
    cy.get("[data-test-id=overlay-helper-bg]").click();
    cy.get("[data-test-id=overlay-helper-bg]").should("not.exist");
    cy.get("[data-test-id=primary-with-secondary]").should("not.exist");
  });
});
