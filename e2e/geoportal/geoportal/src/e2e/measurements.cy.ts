describe("Geoportal measurements", () => {
  beforeEach(() => {
    cy.visit("/");
  });

  it("Measurements", () => {
    cy.get("[data-test-id=measurement-control]").should("be.visible");
    cy.get("[data-test-id=measurement-control]").click();
    cy.get("#routedMap").should("be.visible");
    cy.contains("Aktuell sind keine Messungen").should("be.visible");
    cy.get("#routedMap").click(300, 300);
    cy.get("#routedMap").click(403, 300);
    cy.get("#routedMap").click(403, 300);
    cy.get('[title="Total length"]').should("be.visible");
    cy.get('[title="Total length"]')
      .should("be.visible")
      .invoke("text")
      .then((res) => {
        const resNumber = res.replace(/km/, "");
        cy.wrap(resNumber).as("totallength");
      });
    cy.contains("Strecke")
      .invoke("text")
      .then((string) => {
        const totallengthInfo = string.replace(/[^0-9.]/g, "");
        const rTotalInfo = Math.round(totallengthInfo * 10) / 10;
        cy.get("@totallength").then((totallength) => {
          expect(Number(totallength)).to.equal(rTotalInfo);
        });
      });
    cy.get(".leaflet-bottom.leaflet-right").should("be.visible");
    cy.contains("Linienzug").should("be.visible");
    cy.get(".fa-trash-can").click();
    cy.contains("Aktuell sind keine Messungen").should("be.visible");
  });
});
