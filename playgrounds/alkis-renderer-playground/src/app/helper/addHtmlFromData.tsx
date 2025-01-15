import { Divider, Tabs } from "antd";
import { getAllAdditionalSheets, searchLandparcelByName } from "./getToken";
import AdditionalSheet from "../components/AdditionalSheet";
import CustomCard from "../components/CustomCard";
import { getLandparcelTitle } from "./landparcel";

type Adresse = {
  alkis_adresse: { nummer: string };
};

export const addHtmlFromData = async (
  jwt: string,
  name: string = "053001-137-00020/0001"
) => {
  const landparcelData = await searchLandparcelByName(name, jwt);
  const landparcel = landparcelData.data.alkis_landparcel[0];
  const sheets = await getAllAdditionalSheets(
    landparcelData.data.alkis_landparcel[0].buchungsblaetterArray,
    jwt
  );
  const { alkis_id, flur, fstck_nenner, fstck_zaehler } =
    landparcelData.data.alkis_landparcel[0];
  const title = getLandparcelTitle(alkis_id, flur, fstck_nenner, fstck_zaehler);
  const lage = landparcel.adressenArray[0].alkis_adresse.strasse;

  const wrapStyle = { display: "flex", width: "100%" };
  const colStyle = { width: "50%" };
  const titleStyle = { marginBottom: "14px" };
  const linkStyle = {
    color: "#1677ff",
    cursor: "pointer",
    fontWeight: "500",
  };
  return (
    <CustomCard title={title}>
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
        <div style={colStyle}>Lage:</div>
        <div style={{ ...colStyle, display: "flex", gap: "0.4rem" }}>
          <div>{lage}</div>
          <div style={{ display: "flex", gap: "0.4rem" }}>
            {landparcel.adressenArray.map((a: Adresse, idx: number) => {
              return (
                <div key={idx}>
                  {a.alkis_adresse.nummer.trim()}
                  {idx !== landparcel.adressenArray.length - 1 && ","}
                </div>
              );
            })}
          </div>
        </div>
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
        defaultActiveKey="0"
        tabPosition="left"
        destroyInactiveTabPane={true}
        items={sheets.map((b, i) => {
          const id = String(i);
          return {
            label: (
              <div style={{ padding: "4px 10px" }}>{b.buchungsblattcode}</div>
            ),
            key: id,
            children: (
              <div style={{ display: "flex", gap: "1.6rem" }}>
                <div style={{ marginRight: "4rem" }}>
                  <div>Nr. {b.content.nrCode} auf</div>
                  <div>
                    <div style={linkStyle}>{`${b.buchungsblattcode}`}</div>
                  </div>
                </div>
                <AdditionalSheet
                  owners={b.content.owners}
                  namesArr={b.content.namesArr}
                  legalDesc={b.content.legalDesc}
                />
              </div>
            ),
          };
        })}
      />
    </CustomCard>
  );
};
