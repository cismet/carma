describe("geoportal finder smoke test", () => {
  beforeEach(() => cy.visit("/"));

  it("map loads with key controls", () => {
    cy.get("[data-test-id=zoom-in-control]").should("be.visible");
    cy.get("[data-test-id=zoom-out-control]").should("be.visible");
    cy.get("[data-test-id=full-screen-control]").should("be.visible");
    cy.get("[data-test-id=home-control]").should("be.visible");
    cy.get("[data-test-id=measurement-control]").should("be.visible");
    cy.get("[data-test-id=feature-info-control]").should("be.visible");

    // cy.get("input.rbt-input-main.form-control.rbt-input").should("be.visible");

    // cy.get("#cmdShowModalApplicationMenu").should("be.visible");

    // cy.get(".leaflet-bottom.leaflet-right").should("be.visible");
  });
});
