import { Divider, Tabs } from "antd";
import { getAllAdditionalSheets, searchLandparcelByName } from "./getToken";

const tempData = {
  alkis_landparcel: [
    {
      id: 7825,
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
            id: 115189,
            buchungsblattcode: "053001-033389 ",
          },
        },
        {
          alkis_buchungsblatt: {
            id: 115168,
            buchungsblattcode: "053001-033392 ",
          },
        },
        {
          alkis_buchungsblatt: {
            id: 38621,
            buchungsblattcode: "053001-000200A",
          },
        },
        {
          alkis_buchungsblatt: {
            id: 115246,
            buchungsblattcode: "053001-033393 ",
          },
        },
        {
          alkis_buchungsblatt: {
            id: 115723,
            buchungsblattcode: "053001-033391 ",
          },
        },
        {
          alkis_buchungsblatt: {
            id: 115279,
            buchungsblattcode: "053001-033390 ",
          },
        },
      ],
    },
  ],
};

export const addHtmlFromData = async (
  jwt: string,
  name: string = "053001-137-00020/0001"
) => {
  const landparcelData = await searchLandparcelByName(name);
  const landparcel = landparcelData.data.alkis_landparcel[0];
  const sheets = await getAllAdditionalSheets(
    landparcelData.data.alkis_landparcel[0].buchungsblaetterArray
  );

  console.log("xxx sheets", sheets);
  const lage = landparcel.adressenArray[0].alkis_adresse.strasse;

  const wrapStyle = { display: "flex", width: "100%" };
  const colStyle = { width: "50%" };
  const titleStyle = { marginBottom: "14px" };
  return (
    <div>
      <h4 style={titleStyle}>Flurstücksinformationen</h4>
      <div style={wrapStyle}>
        <div style={colStyle}>Flurstückenzeichen:</div>
        <div style={colStyle}>{name}</div>
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
        items={sheets.map((b, i) => {
          const id = String(i);
          return {
            label: b.buchungsblattcode,
            key: id,
            disabled: i === 28,
            children: (
              <div style={{ display: "flex", gap: "4rem" }}>
                <div>
                  <div>Nr. 0001 auf</div>
                  <div>
                    <div
                      style={{
                        display: "flex",
                        gap: "2rem",
                        justifyContent: "space-between",
                      }}
                    >
                      <div>{`${b.buchungsblattcode}`}</div>
                      <div>{`${b.content.laufendeNummer}`}</div>
                    </div>
                  </div>
                </div>
                <div>
                  <div>{`${b.content.salutation} ${b.content.firstName || ""} ${
                    b.content.surName
                  }, ${
                    b.content.salutation !== "Firma"
                      ? "*" + b.content.formattedDate
                      : ""
                  }`}</div>
                  <div>{`${b.content.street} ${b.content.houseNumber}`}</div>
                  <div>{`${b.content.postalCode}, ${b.content.city}`}</div>
                  <div>(Grundbuchamtliche Anschrift)</div>
                </div>
              </div>
            ),
          };
        })}
      />
    </div>
  );
};
