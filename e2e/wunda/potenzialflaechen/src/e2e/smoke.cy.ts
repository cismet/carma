describe('potenzialflaechen smoke test', () => {
  beforeEach(() => cy.visit('/'));

  it('map loads with key controls', () => {
    cy.get('.leaflet-control-zoom-out').should('be.visible');

    cy.get('input.rbt-input-main.form-control.rbt-input').should('be.visible');

    cy.get('#cmdShowModalApplicationMenu').should('be.visible');

    cy.get('.leaflet-bottom.leaflet-right').should('be.visible');
  });
});
