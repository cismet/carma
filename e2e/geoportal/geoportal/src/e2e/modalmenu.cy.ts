describe("Fuzzy search should show search results and move map to the selected item.", () => {
  beforeEach(() => {
    cy.visit("/");
  });

  const toggleAccordion = (sectionName: string) => {
    cy.get(".collapse.show").should("not.exist");
    cy.get(`[name=${sectionName}]`).find("button").should("exist");
    cy.get(`[name=${sectionName}]`).find("button").click({ force: true });
    cy.get(".collapse.show").should("exist");
    cy.get(".collapse.show").find("*").invoke("text").should("not.be.empty");
    cy.get(`[name=${sectionName}]`).find("button").click({ force: true });
    cy.get(".collapse.show").should("not.exist");
  };

  it("Modal menu opens and contains header, introduction, sections, footer.", () => {
    cy.get("[data-test-id=modal-menu-btn]").click();
    cy.get(".modal-title").should("be.visible");
    cy.get(".modal-header").should("be.visible");
    cy.contains("Wählen Sie eine der folgenden farbigen Schaltflächen").should(
      "be.visible"
    );
    cy.get(".accordion").should("have.length.greaterThan", 3);

    toggleAccordion("datengrundlage");
    toggleAccordion("positionieren");
    toggleAccordion("standort");
    toggleAccordion("zwilling");

    cy.get(".modal-footer").should("be.visible");
    cy.get("#cmdCloseModalApplicationMenu").should("be.visible");
    cy.get("#cmdCloseModalApplicationMenu").click();
    cy.get("#cmdCloseModalApplicationMenu").should("not.exist");
  });
});
