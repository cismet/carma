import { Divider, Tabs } from "antd";
import { getAllAdditionalSheets } from "./getToken";

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

export const addHtmlFromData = async (jwt: string, data = demoLandparcel) => {
  const landparcel = data.data.alkis_landparcel[0];
  const addShits = await getAllAdditionalSheets(
    jwt,
    landparcel.buchungsblaetterArray
  );
  const lage = landparcel.adressenArray[0].alkis_adresse.strasse;
  const { buchungsblaetterArray } = landparcel;
  const wrapStyle = { display: "flex", width: "100%" };
  const colStyle = { width: "50%" };
  const titleStyle = { marginBottom: "14px" };
  return (
    <div>
      <h4 style={titleStyle}>Flurstücksinformationen</h4>
      <div style={wrapStyle}>
        <div style={colStyle}>Flurstückenzeichen:</div>
        <div style={colStyle}>{landparcel.alkis_id}</div>
      </div>
      <div style={wrapStyle}>
        <div style={colStyle}>Gemeinde:</div>
        <div style={colStyle}>Wuppertal</div>
      </div>
      <div style={wrapStyle}>
        <div style={colStyle}>Gemarkung:</div>
        <div style={colStyle}>{landparcel.gemarkung}</div>
      </div>
      <div style={wrapStyle}>
        <div style={colStyle}>Lage:</div> <div style={colStyle}>{lage}</div>
      </div>
      <div style={wrapStyle}>
        <div style={colStyle}>Größe:</div>
        <div style={colStyle}>
          {landparcel.groesse} m<sup>2</sup>
        </div>
      </div>
      <Divider />
      <h4 style={titleStyle}>Buchungsblätter</h4>
      <Tabs
        defaultActiveKey="1"
        tabPosition="left"
        style={{ height: 220 }}
        items={buchungsblaetterArray.map((b, i) => {
          const id = String(i);
          return {
            label: b.alkis_buchungsblatt.buchungsblattcode,
            key: id,
            disabled: i === 28,
            children: `Content of ${b.alkis_buchungsblatt.buchungsblattcode} landparcel ${id} `,
          };
        })}
      />
    </div>
  );
};
