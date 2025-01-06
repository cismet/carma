const demoLandparcel = {
  data: {
    alkis_landparcel: [
      {
        id: 1,
        bezeichnung: "001-00003/0002",
        gemarkung: "Barmen",
        groesse: 175,
        adressenArray: [
          {
            alkis_adresse: {
              strasse: "(01389) Herzkamper Straße",
            },
          },
        ],
      },
    ],
  },
};

export const addHtmlFromData = (data = demoLandparcel) => {
  const landparcel = data.data.alkis_landparcel[0];
  const lage = landparcel.adressenArray[0].alkis_adresse.strasse;
  return (
    <div>
      <h3>Flurstücksinformationen</h3>
      <div>Flurstückenzeichen: {landparcel.bezeichnung}</div>
      <div>Gemeinde: Wuppertal</div>
      <div>Gemarkung: {landparcel.gemarkung}</div>
      <div>Lage: {lage}</div>
      <div>
        Größe: {landparcel.groesse} m<sup>2</sup>
      </div>
    </div>
  );
};
