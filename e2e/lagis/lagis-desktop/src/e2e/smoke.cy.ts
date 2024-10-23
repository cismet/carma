describe('lagis smoke test', () => {
  let userData;

  before(() => {
    cy.fixture('devSecrets.json').then((data) => {
      userData = data;
    });
  });

  beforeEach(() => cy.visit('/'));

  it('main page show map, menu, cards, combo boxes afte authorisation', () => {
    cy.contains('LagIS Desktop').should('exist');
    cy.get('input[type="email"]').type(userData.cheatingUser);
    cy.get('input[type="password"]').type(userData.cheatingPassword);
    cy.get('.ant-btn').click();
    cy.wait(5000);
    cy.get('input[type="search"]').as('searchInput');
    cy.get('@searchInput').should('have.length', 3);
    cy.get('.ant-menu-item').should('have.length', 9);
    cy.contains('Karte');
    cy.get('.dashboard-tile').should('have.length', 8);
    cy.get('.logout').click();
    cy.contains('LagIS Desktop').should('be.visible');
  });
});
