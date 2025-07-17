describe("lagis smoke test", () => {
  let userData;

  before(() => {
    cy.fixture("devSecrets.json").then((data) => {
      userData = data;
    });
  });

  beforeEach(() => cy.visit("/"));

  it("main page show map, menu, cards, combo boxes afte authorisation", () => {
    cy.contains("LagIS").should("exist");
    cy.get('input[type="email"]').type(userData.cheatingUser);
    cy.get('input[type="password"]').type(userData.cheatingPassword);
    cy.get(".ant-btn").click();
    cy.wait(5000);
    cy.get("[data-test-id=fuzzy-search]").should("be.visible");
    cy.get(".ant-menu-item").should("have.length", 9);
    cy.contains("Karte");
    cy.get(".logout").click();
    cy.contains("LagIS Desktop").should("be.visible");
  });
});
