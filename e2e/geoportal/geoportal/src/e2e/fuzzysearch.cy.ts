// describe("Fuzzy search should show search results and move map to the selected item.", () => {
//   beforeEach(() => {
//     cy.visit("/");
//   });

//   it("Fuzzy search shows search results and display the selected item on the map", () => {
//     cy.get(".ant-select-item.ant-select-item-option").should("not.exist");
//     cy.get(".leaflet-marker-icon").should("not.exist");

//     cy.get("[data-test-id=fuzzy-search]")
//       .should("be.visible")
//       .wait(500)
//       .find("input")
//       .type("gabel");

//     cy.location("hash").then((hash) => {
//       const queryString = hash.slice(2);
//       const urlParams = new URLSearchParams(queryString);

//       let lat = urlParams.get("lat");
//       let lng = urlParams.get("lng");

//       console.log("xxx lat:", lat);
//       console.log("xxx long:", lng);
//       cy.wrap(lat).as("lat");
//       cy.wrap(lng).as("lng");
//     });

//     cy.get(".ant-select-item.ant-select-item-option")
//       .should("have.length.greaterThan", 5)
//       .first()
//       .click();

//     cy.get(".leaflet-marker-icon").should("be.visible");

//     cy.get(".fuzzy-search-container > .ant-btn").should("be.visible");
//     cy.get(".fuzzy-search-container > .ant-btn").click();

//     cy.get(".leaflet-marker-icon").should("not.exist");

//     cy.location("hash").then((hash) => {
//       const queryString = hash.slice(2);
//       const urlParams = new URLSearchParams(queryString);

//       let lat = urlParams.get("lat");
//       let lng = urlParams.get("lng");

//       cy.get("@lat").then((storedLat) => {
//         cy.wrap(lat).should("not.eq", storedLat);
//       });

//       cy.get("@lng").then((storedLng) => {
//         cy.wrap(lng).should("not.eq", storedLng);
//       });
//     });
//   });
// });

Cypress._.times(10, (k) => {
  describe(
    "Fuzzy search should show search results and move map to the selected item." +
      k,
    () => {
      beforeEach(() => {
        cy.visit("/");
      });

      it("Fuzzy search shows search results and display the selected item on the map", () => {
        cy.get(".ant-select-item.ant-select-item-option").should("not.exist");
        cy.get(".leaflet-marker-icon").should("not.exist");

        cy.get("[data-test-id=fuzzy-search]")
          .should("be.visible")
          .wait(500)
          .find("input")
          .type("gabel");

        cy.location("hash").then((hash) => {
          const queryString = hash.slice(2);
          const urlParams = new URLSearchParams(queryString);

          let lat = urlParams.get("lat");
          let lng = urlParams.get("lng");

          console.log("xxx lat:", lat);
          console.log("xxx long:", lng);
          cy.wrap(lat).as("lat");
          cy.wrap(lng).as("lng");
        });

        cy.get(".ant-select-item.ant-select-item-option")
          .should("have.length.greaterThan", 5)
          .first()
          .click();

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
    }
  );
});
