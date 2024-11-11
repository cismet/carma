describe("Full screen", () => {
  beforeEach(() => {
    cy.visit("/");
  });

  it("Full screen open app on in full page", () => {
    // cy.get("#routedMap").should("be.visible");
    // cy.get("[data-test-id=full-screen-control]").should("be.visible");

    // cy.wait(1000);
    // cy.get("#routedMap").then(($container) => {
    //   const initialWidth = $container.width();
    //   const initialHeight = $container.height();

    //   cy.wrap(initialWidth).as("initialWidth");
    //   cy.wrap(initialHeight).as("initialHeight");

    //   console.log("xxx initial sizes", initialWidth, initialHeight);
    // });

    // cy.get("[data-test-id=full-screen-control]").click();
    cy.get("[data-test-id=full-screen-control]").click();

    // cy.get("#routedMap").then(($container) => {
    //   const fullWidth = $container.width();
    //   const fullHeight = $container.height();

    //   // cy.wrap(fullWidth).as("fullWidth");
    //   // cy.wrap(fullWidth).as("initialHeight");

    //   cy.get("@initialWidth").then((initialWidth) => {
    //     console.log("xxx full page sizes", initialWidth, fullWidth);
    //   });
    // });
  });
});
