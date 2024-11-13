describe("geoportal smoke test", () => {
  beforeEach(() => cy.visit("/"));

  it("Map loads with key controls and buttons", () => {
    cy.get("[data-test-id=helper-overlay-btn]").should("be.visible");
    cy.get("[data-test-id=helper-overlay-btn]").click();
    cy.get("[data-test-id=overlay-helper-bg]").should("be.visible");
    cy.get("[data-test-id=primary-with-secondary]").should(
      "have.length.greaterThan",
      5
    );
    cy.get(".ant-popover-content").should("not.exist");
    cy.get("[data-test-id=primary-with-secondary]").first().click();
    cy.get(".ant-popover-content").should("be.visible");
    cy.get("[data-test-id=primary-with-secondary]").first().click();
    cy.get(".ant-popover-content").should("not.be.visible");
    cy.get("[data-test-id=overlay-helper-bg]").click();
    cy.get("[data-test-id=overlay-helper-bg]").should("not.exist");
    cy.get("[data-test-id=primary-with-secondary]").should("not.exist");
  });
});
