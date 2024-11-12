describe("Geoportal measurements", () => {
  beforeEach(() => {
    cy.visit("/");
  });

  it("Measurements", () => {
    cy.get("[data-test-id=measurement-control]").should("be.visible");
    cy.get("[data-test-id=measurement-control]").click();
    cy.get("#routedMap").should("be.visible");
    cy.contains("Aktuell sind keine Messungen").should("be.visible");
    cy.get("#routedMap").click(300, 300);
    cy.get("#routedMap").click(400, 300);
    cy.get("#routedMap").click(400, 300);
    cy.get(".leaflet-bottom.leaflet-right").should("be.visible");
    cy.contains("Linienzug").should("be.visible");
    cy.get(".fa-trash-can").click();
    cy.contains("Aktuell sind keine Messungen").should("be.visible");
  });
});
