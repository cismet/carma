describe("Fuzzy search should show search results and move map to the selected item.", () => {
  beforeEach(() => {
    cy.visit("/");
  });

  it("Fuzzy search shows search results and display the selected item on the map", () => {
    cy.get(".ant-select-item.ant-select-item-option").should("not.exist");
    cy.get(".leaflet-marker-icon").should("not.exist");

    // cy.intercept(
    //   "GET",
    //   "https://wupp-topicmaps-data.cismet.de/data/3857/adressen.json.md5"
    // ).as("adressen");

    // cy.intercept(
    //   "GET",
    //   "https://wupp-topicmaps-data.cismet.de/data/3857/kitas.json.md5"
    // ).as("kitas");

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

    cy.wait("@data").then((response) => {
      console.log("xxx data", response);
    });

    cy.location("hash").then((hash) => {
      const queryString = hash.slice(2);
      const urlParams = new URLSearchParams(queryString);

      let lat = urlParams.get("lat");
      let lng = urlParams.get("lng");

      cy.wrap(lat).as("lat");
      cy.wrap(lng).as("lng");
    });

    cy.get("[data-test-id=fuzzy-search]")
      .should("be.visible")
      .find("input")
      // .wait("@data")
      .type("ach");

    // cy.pause();
    cy.wait("@data");

    // cy.get(".ant-select-item.ant-select-item-option").should("be.visible");
    // cy.get(".ant-select-item.ant-select-item-option").first().click();

    // cy.contains(".ant-select-item.ant-select-item-option", "Achenbachstr.")
    //   .should("be.visible")
    //   .click();

    // cy.get(".ant-select-item.ant-select-item-option")
    //   .should("have.length.greaterThan", 5)
    //   .first()
    //   .click();

    cy.get(".leaflet-marker-icon").should("be.visible");

    cy.get(".fuzzy-search-container > .ant-btn").should("be.visible");
    cy.get(".fuzzy-search-container > .ant-btn").click();

    cy.get(".leaflet-marker-icon").should("not.exist");

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
