describe("Fuzzy search should show search results and move map to the selected item.", () => {
  beforeEach(() => {
    cy.intercept("GET", "https://wupp-topicmaps-data.cismet.de/**", {
      statusCode: 200,
      body: [
        {
          s: "Achenbachstr.",
          nr: 1,
          z: "",
          g: "home",
          x: 793007.83,
          y: 6668501.93,
          m: { zl: 18 },
        },
        {
          s: "Achenbachstr.",
          nr: 9,
          z: "",
          g: "home",
          x: 793053.3,
          y: 6668415.06,
          m: { zl: 18 },
        },
        {
          s: "Achenbachtreppe",
          nr: 0,
          z: "",
          g: "road",
          x: 793022.68,
          y: 6668515.97,
          m: { zl: 18 },
        },
      ],
    }).as("data");

    cy.intercept(
      "GET",
      "https://geodaten.metropoleruhr.de/spw2/service?transparent=true&format=image%2Fpng&service=WMS&version=1.1.1&request=GetMap&styles=&layers=spw2_graublau&bbox=0%2C-90%2C180%2C90&width=256&height=256&srs=EPSG%3A4326",
      {
        statusCode: 200,
        body: "stubbed response data",
      }
    ).as("geodaten");
    cy.intercept(
      "GET",
      "https://cesium-wupp-terrain.cismet.de/terrain2020/0/1/0.terrain?v=1.1.0",
      {
        statusCode: 200,
        body: "stubbed response data",
      }
    ).as("terrain");
    cy.intercept(
      "GET",
      "https://maps.wuppertal.de/gebiet?service=WMS&request=GetCapabilities&version=1.1.1",
      {
        statusCode: 200,
        body: "stubbed response data",
      }
    ).as("maps");

    cy.visit("/");
  });

  it("Fuzzy search shows search results and display the selected item on the map", () => {
    cy.wait(["@data"]);

    cy.get(".ant-select-item.ant-select-item-option").should("not.exist");
    cy.get(".leaflet-marker-icon").should("not.exist");

    cy.location("hash").then((hash) => {
      const queryString = hash.slice(2);
      const urlParams = new URLSearchParams(queryString);

      let lat = urlParams.get("lat");
      let lng = urlParams.get("lng");

      cy.wrap(lat).as("lat");
      cy.wrap(lng).as("lng");
    });
    //Achenbachstr
    cy.get("[data-test-id=fuzzy-search]")
      .should("be.visible")
      .find("input")
      .type("Achenbachtreppe");

    cy.get(".ant-select-dropdown").should("exist");
    cy.get(".ant-select-item.ant-select-item-option").should("exist");
    // cy.waitUntil(
    //   () =>
    //     cy
    //       .get(".ant-select-item.ant-select-item-option")
    //       .should("have.length.greaterThan", 0),
    //   { timeout: 12000, interval: 600 }
    // ).then(() => {
    //   cy.get(".ant-select-item.ant-select-item-option").first().click();
    // });

    cy.get(".ant-select-item.ant-select-item-option").should("be.visible");
    cy.get(".ant-select-item.ant-select-item-option").first().click();

    cy.get(".leaflet-marker-icon").should("be.visible");

    cy.get(".fuzzy-search-container > .ant-btn").should("be.visible");
    cy.get(".fuzzy-search-container > .ant-btn").click();

    cy.location("hash").then((hash) => {
      const queryString = hash.slice(2);
      const urlParams = new URLSearchParams(queryString);

      let lat = urlParams.get("lat");
      let lng = urlParams.get("lng");

      cy.get("@lat").then((storedLat) => {
        cy.wrap(lat).should("not.eq", storedLat);
      });

      cy.get("@lng").then((storedLng) => {
        cy.wrap(lng).should("not.eq", storedLng);
      });
    });
  });
});
