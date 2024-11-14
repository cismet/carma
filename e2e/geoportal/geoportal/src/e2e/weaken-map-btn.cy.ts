describe("Geoportal weaken the map background", () => {
  beforeEach(() => {
    cy.visit("/");
  });

  it("Weaken the map backgroun button adds background to the map.", () => {
    cy.get("[data-test-id=hintergrundkarte-btn]").should("be.visible");
    cy.get("[data-test-id=hintergrundkarte-btn]").click();
    cy.get(".leaflet-tile-loaded").should("be.visible");

    cy.get(".leaflet-tile-loaded")
      .filter("div")
      .each(($el) => {
        const background = $el.css("background");
        if (background !== "none") {
          cy.wrap($el).should("be.visible");
        }
      });

    cy.get("[data-test-id=hintergrundkarte-btn]").click();
    cy.get(".leaflet-tile-loaded").each(($el) => {
      cy.wrap($el).children("div").should("not.exist");
    });
  });
});
