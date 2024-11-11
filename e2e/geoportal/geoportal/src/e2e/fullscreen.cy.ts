describe("Full screen", () => {
  beforeEach(() => {
    cy.visit("/");
  });

  it("Full screen open app on in full page", () => {
    cy.get("#routedMap").should("be.visible");
    cy.get("[data-test-id=full-screen-control]").should("be.visible");

    cy.wait(1000);
    cy.get("#routedMap").then(($container) => {
      const initialWidth = $container.width();
      const initialHeight = $container.height();

      cy.wrap(initialWidth).as("initialWidth");
      cy.wrap(initialHeight).as("initialHeight");
    });

    cy.get("[data-test-id=full-screen-control]").realClick();

    cy.wait(1000);

    cy.get("#routedMap").then(($container) => {
      const fullWidth = $container.width();
      const fullHeight = $container.height();

      cy.get("@initialWidth").then((initialWidth) => {
        cy.wrap(fullWidth).should("not.eq", initialWidth);
      });

      cy.get("@initialHeight").then((initialHeight) => {
        cy.wrap(fullHeight).should("not.eq", initialHeight);
      });
    });

    cy.get("[data-test-id=full-screen-control]").realClick();
  });
});
