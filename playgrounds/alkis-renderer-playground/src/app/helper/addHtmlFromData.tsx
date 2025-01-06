// const demoLandparcel = {
//   data: {
//     alkis_landparcel: [
//       {
//         id: 1,
//         bezeichnung: "001-00003/0002",
//         gemarkung: "Barmen",
//         groesse: 175,
//         adressenArray: [
//           {
//             alkis_adresse: {
//               strasse: "(01389) Herzkamper Straße",
//             },
//           },
//         ],
//       },
//     ],
//   },
// };

const demoLandparcel = {
  data: {
    alkis_landparcel: [
      {
        id: 7827,
        alkis_id: "053001-137-00020/0001",
        bezeichnung: "137-00020/0001",
        gemarkung: "Barmen",
        groesse: 1938,
        adressenArray: [
          {
            alkis_adresse: {
              strasse: "(02820) Reichsstraße",
            },
          },
          {
            alkis_adresse: {
              strasse: "(02820) Reichsstraße",
            },
          },
          {
            alkis_adresse: {
              strasse: "(02820) Reichsstraße",
            },
          },
        ],
        buchungsblaetterArray: [
          {
            alkis_buchungsblatt: {
              id: 115277,
              buchungsblattcode: "053001-033390 ",
            },
          },
          {
            alkis_buchungsblatt: {
              id: 38619,
              buchungsblattcode: "053001-000200A",
            },
          },
          {
            alkis_buchungsblatt: {
              id: 115166,
              buchungsblattcode: "053001-033392 ",
            },
          },
          {
            alkis_buchungsblatt: {
              id: 115721,
              buchungsblattcode: "053001-033391 ",
            },
          },
          {
            alkis_buchungsblatt: {
              id: 115187,
              buchungsblattcode: "053001-033389 ",
            },
          },
          {
            alkis_buchungsblatt: {
              id: 115244,
              buchungsblattcode: "053001-033393 ",
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
      {/* <h3>Flurstücksinformationen</h3> */}
      <div>Flurstückenzeichen: {landparcel.alkis_id}</div>
      <div>Gemeinde: Wuppertal</div>
      <div>Gemarkung: {landparcel.gemarkung}</div>
      <div>Lage: {lage}</div>
      <div>
        Größe: {landparcel.groesse} m<sup>2</sup>
      </div>
    </div>
  );
};
