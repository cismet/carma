describe("potenzialflaechen smoke test", () => {
  beforeEach(() => cy.visit("/"));

  it("map loads with key controls", () => {
    cy.get("[data-test-id=zoom-control]").should("exist");

    cy.get("[data-test-id=fuzzy-search]").should("exist");

    cy.get("#cmdShowModalApplicationMenu").should("exist");

    cy.get("[data-test-id=info-box]").should("exist");
  });
});
