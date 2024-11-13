describe("Geoportal home", () => {
  beforeEach(() => {
    cy.visit("/");
  });

  const getLatAndLngValue = () => {
    return cy.location("hash").then((hash) => {
      const urlParams = new URLSearchParams(hash.slice(2));
      const lat = urlParams.get("lat");
      const lng = urlParams.get("lng");

      if (lat === null || lng === null) {
        throw new Error("Lat or lng parameteres is missing in the URL");
      }

      return {
        lat,
        lng,
      };
    });
  };

  it("Click on the home button change lat and lng in the url.", () => {
    cy.get("[data-test-id=home-control]").should("be.visible");
    cy.wait(500);
    getLatAndLngValue().then((params) => {
      const { lat: initLat, lng: initLng } = params;

      cy.get("[data-test-id=home-control]").click();
      cy.wait(4000);

      getLatAndLngValue().then((params) => {
        const { lat, lng } = params;
        expect(lat).to.be.not.eq(initLat);
        expect(lng).to.be.not.eq(initLng);
      });
    });
  });
});
