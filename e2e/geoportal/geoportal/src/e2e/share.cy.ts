describe("Geoportal share", () => {
  beforeEach(() => {
    cy.visit("/");
  });

  it("Share buttons add to clipboard a configured link.", () => {
    cy.window().then((win) => {
      cy.stub(win.navigator.clipboard, "writeText").as("copy");
    });
    cy.get("[data-test-id=teilen-btn]").should("be.visible");
    cy.get("[data-test-id=teilen-btn]").click();
    cy.contains("Link kopieren").should("be.visible");
    cy.contains("Link kopieren").click();

    cy.get("@copy").then((stub) => {
      const clipboardStub = stub as unknown as sinon.SinonStub;
      const clipStr = clipboardStub.getCall(0).args[0];
      expect(clipStr).to.include("data");
      expect(clipStr).to.include("lat");
      expect(clipStr).to.include("lng");
    });
    cy.get('input[value="publish/"]').should("exist");
    cy.get('input[value="publish/"]').check();
    cy.contains("Link kopieren").click();
    cy.wait(1000);

    cy.get("@copy").then((stub) => {
      const clipboardStub = stub as unknown as sinon.SinonStub;
      const clipStr = clipboardStub.lastCall.args[0];
      expect(clipStr).to.include("publish");
      expect(clipStr).to.include("data");
      expect(clipStr).to.include("lat");
      expect(clipStr).to.include("lng");
    });
  });
});
