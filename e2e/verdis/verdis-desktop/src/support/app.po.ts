export const checkBuildModal = () => {
  cy.get('[aria-label="build"]').click();
  cy.contains('Suche über Grundbuchblattnummer').should('be.visible');
  cy.get('.ant-modal-wrap').click();
  cy.contains('Suche über Grundbuchblattnummer').should('be.not.visible');
};

export const checkDrawer = () => {
  cy.get('.ant-avatar').click();
  cy.contains('Optionale Layer').should('be.visible');
  cy.contains('Hintergrund').should('be.exist');
  cy.get('.ant-drawer-mask').click();
  cy.contains('Optionale Layer').should('be.not.visible');
  cy.contains('Hintergrund').should('be.not.visible');
};

export const walkThroughMenu = () => {
  cy.contains('Versiegelte Flächen').click();
  cy.get('h4').contains('Versiegelte Flächen');
  cy.get('.ant-card').should('have.length', 3);
  cy.contains('Flächen').should('be.visible');
  cy.contains('Übersicht').should('be.visible');

  cy.contains('Straßenreinigung').click();
  cy.get('h4').contains('Straßenreinigung');

  cy.contains('Info').click();
  cy.get('h4').contains('Info');

  cy.get('img[alt=Logo]').click();
  cy.get('h4').contains('Übersicht');

  cy.contains('Versickerungsgenehmigungen').click();
  cy.get('h4').contains('Versickerungsgenehmigungen');
};
