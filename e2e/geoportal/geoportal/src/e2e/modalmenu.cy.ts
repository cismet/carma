describe("Fuzzy search should show search results and move map to the selected item.", () => {
  beforeEach(() => {
    cy.visit("/");
  });

  it("Modal menu opens and contains header, introduction, sections, footer.", () => {
    cy.get("[data-test-id=modal-menu-btn]").click();
    cy.get(".modal-title").should("be.visible");
    cy.get(".modal-header").should("be.visible");
    cy.contains("Wählen Sie eine der folgenden farbigen Schaltflächen").should(
      "be.visible"
    );
    cy.get(".accordion").should("have.length.greaterThan", 3);

    cy.get(".collapse.show").should("not.exist");
    cy.get("[name=datengrundlage]").find("button").should("exist");
    cy.get("[name=datengrundlage]").find("button").click({ force: true });
    cy.get(".collapse.show").should("exist");
    cy.get("[name=datengrundlage]").find("button").click({ force: true });

    cy.get(".collapse.show").should("not.exist");
    cy.get("[name=zwilling]").find("button").should("exist");
    cy.get("[name=zwilling]").find("button").click({ force: true });
    cy.get(".collapse.show").should("exist");
    cy.get("[name=zwilling]").find("button").click({ force: true });
    cy.get(".collapse.show").should("not.exist");

    cy.get(".modal-footer").should("be.visible");
    cy.get("#cmdCloseModalApplicationMenu").should("be.visible");
    cy.get("#cmdCloseModalApplicationMenu").click();
    cy.get("#cmdCloseModalApplicationMenu").should("not.exist");
  });
});
