import {
  checkBuildModal,
  checkDrawer,
  walkThroughMenu,
} from '../support/app.po';

describe('verdis smoke test', () => {
  let userData;

  before(() => {
    cy.fixture('devSecrets.json').then((data) => {
      userData = data;
    });
  });

  beforeEach(() => cy.visit('/'));

  it('main page show authorization form', () => {
    cy.contains('VerDIS Desktop');
    cy.get('#username').type(userData.cheatingUser);
    cy.get('#password').type(userData.cheatingPassword);
    cy.contains('Anmelden').should('be.visible');
    cy.get('.ant-btn').click();
    cy.contains('Karte').should('be.visible');
    cy.get('input[name="kassenzeichen"]');
    cy.get('.ant-card').should('have.length', 6);
    cy.get('[aria-label="file-pdf"]').should('be.visible');
    checkBuildModal();
    checkDrawer();
    walkThroughMenu();
    cy.get('[aria-label="logout"]').click();
    cy.contains('VerDIS Desktop');
  });
});
