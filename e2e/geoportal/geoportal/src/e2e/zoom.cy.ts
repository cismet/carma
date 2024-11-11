describe("Geoportal zoom", () => {
  beforeEach(() => {
    cy.visit("/");
  });

  const getZoomLevel = () => {
    return cy.location("hash").then((hash) => {
      const urlParams = new URLSearchParams(hash.slice(2));
      const zoomLevel = urlParams.get("zoom");

      if (zoomLevel === null) {
        throw new Error("Zoom parameter is missing in the URL");
      }

      return parseInt(zoomLevel, 10);
    });
  };

  it("Zoom level increases and reduces  by controls button", () => {
    cy.get("[data-test-id=zoom-in-control]").should("be.visible");
    cy.get("[data-test-id=zoom-out-control]").should("be.visible");
    cy.wait(500);
    getZoomLevel().then((initialZoom) => {
      console.log("xxx first zoom", initialZoom);
      expect(Number.isInteger(initialZoom)).to.eq(true);

      cy.get("[data-test-id=zoom-in-control]").click();

      cy.wait(1000);

      getZoomLevel().then((newZoom) => {
        expect(newZoom).to.be.greaterThan(initialZoom);
      });

      cy.get("[data-test-id=zoom-out-control]").click();

      cy.wait(1000);

      getZoomLevel().then((newZoom) => {
        expect(newZoom).to.be.eq(initialZoom);
      });
    });
  });
});
