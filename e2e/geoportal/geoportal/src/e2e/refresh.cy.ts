describe("Geoportal refresh", () => {
  beforeEach(() => {
    cy.visit("/");
  });

  it("Refresh button reload page and switch off the measurement mode", () => {
    cy.get("[data-test-id=reload-btn]").should("be.visible");
    cy.get("[data-test-id=measurement-control]").should("be.visible");
    cy.get("[data-test-id=measurement-control]").click();
    cy.get("[data-test-id=empty-measurement-info]").should("be.visible");
    cy.get("[data-test-id=reload-btn]").click();
    cy.get("[data-test-id=empty-measurement-info]").should("not.exist");
  });
});
