describe('verkehrszeichenkataster smoke test', () => {
  let userData;

  before(() => {
    cy.fixture('devSecrets.json').then((data) => {
      userData = data;
    });
  });

  beforeEach(() => {
    cy.visit('/');
  });

  it('page show map, dashboard, search, navigation, control buttons', () => {
    cy.contains('Verkehrszeichen Kataster').should('exist');
    cy.get('#username').type(userData.cheatingUser);
    cy.get('#password').type(userData.cheatingPassword);
    cy.get('.ant-btn').click();
    cy.get('.ant-input').should('be.visible');
    cy.contains('Karte').should('be.visible');
    cy.contains('Anzahl').should('be.visible');
    cy.contains('Infos').should('be.visible');
    cy.contains('Andere Infos').should('be.visible');
    cy.contains('Intern').click();
    cy.get('ul.flex.items-center.gap-2.list-none.px-0')
      .children('li')
      .should('have.length', 1);
    cy.contains('Extern').click();
    cy.get('ul.flex.items-center.gap-2.list-none.px-0')
      .children('li')
      .should('have.length', 2);
    cy.get('[aria-label="logout"]').click();
    cy.contains('Verkehrszeichen Kataster').should('be.visible');
  });
});
