describe("stadtplan smoke test", () => {
  beforeEach(() => cy.visit("/"));

  it("map loads with key controls", () => {
    cy.get("[data-test-id=zoom-control]").should("be.visible");

    cy.get("[data-test-id=fuzzy-search]").should("be.visible");

    cy.get("#cmdShowModalApplicationMenu").should("be.visible");

    cy.get("[data-test-id=info-box]").should("be.visible");
  });
});
