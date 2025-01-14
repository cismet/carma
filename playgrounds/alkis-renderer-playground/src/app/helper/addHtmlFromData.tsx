import { Divider, Tabs } from "antd";
import { getAllAdditionalSheets, searchLandparcelByName } from "./getToken";

const tempData = {
  contentType: "application/octet-stream",
  res: {
    id: "DENW29AL1000EWuI",
    multiBuchungsblattUUIds: null,
    descriptionOfRechtsgemeinschaft: [
      "Zu 4.1 und 4.2 in Errungenschaftsgemeinschaft nach russischem Recht",
    ],
    buchungsblattCode: "053001-011062 ",
    owners: [
      {
        buchungsblattCode: "053001-011062 ",
        akademischergrad: null,
        sonstigeEigenschaft: null,
        part: null,
        addresses: [
          {
            country: "DEUTSCHLAND",
            city: "Krefeld",
            houseNumber: "409",
            pob: null,
            postalCodePOB: null,
            postalCode: "47805",
            street: "Gladbacher Str.",
            ownerId: "DENW29AL20000OwE",
            district: null,
            herkunftAdress: "Grundbuchamt",
          },
        ],
        ownerId: "DENW29AL20000OwE",
        nameOfBirth: null,
        firstName: "Vladimir",
        dateOfBirth: "1962-03-13T00:00:00Z",
        namenzusatz: null,
        surName: "Fokin",
        dateOfDead: null,
        foreName: "Vladimir",
        residence: null,
        salutationCode: "2000",
        salutation: "Herr",
        nameNumber: "4.1",
        kindOfOwner: {
          kindOfOwnerCode: "1000",
          kindOfOwnerName: "Natürliche Personen",
        },
        katasterPerson: null,
        representative: null,
      },
      {
        buchungsblattCode: "053001-011062 ",
        akademischergrad: null,
        sonstigeEigenschaft: null,
        part: null,
        addresses: [
          {
            country: "DEUTSCHLAND",
            city: "Krefeld",
            houseNumber: "409",
            pob: null,
            postalCodePOB: null,
            postalCode: "47805",
            street: "Gladbacher Str.",
            ownerId: "DENW29AL20000OwH",
            district: null,
            herkunftAdress: "Grundbuchamt",
          },
        ],
        ownerId: "DENW29AL20000OwH",
        nameOfBirth: null,
        firstName: "Alla",
        dateOfBirth: "1962-08-23T00:00:00Z",
        namenzusatz: null,
        surName: "Klyubina",
        dateOfDead: null,
        foreName: "Alla",
        residence: null,
        salutationCode: "1000",
        salutation: "Frau",
        nameNumber: "4.2",
        kindOfOwner: {
          kindOfOwnerCode: "1000",
          kindOfOwnerName: "Natürliche Personen",
        },
        katasterPerson: null,
        representative: null,
      },
    ],
    buchungsstellen: [
      {
        id: "DENW29AL1000BdJy",
        number: null,
        description: null,
        sequentialNumber: "0008",
        buchungsartCode: "1100",
        buchungsstellen: null,
        landAgents: null,
        fraction: null,
        landParcel: [
          {
            location: {
              location: null,
              houseNumbers: ["9", "7"],
              minX: "374347.707",
              maxY: "5681608.106",
              minY: "5681579.273",
              maxX: "374380.041",
              landParcelCode: "053001-121-00097/0019",
              streetKeys: ["0512400001393", "0512400001393"],
              buildingIds: ["DENW29AL1000BM9I", "DENW29AL1000BM9I"],
              streetNames: ["Heubruch", "Heubruch"],
              districts: [null, null],
              allGeometryY: [
                [
                  "5681581.079",
                  "5681579.273",
                  "5681582.103",
                  "5681591.651",
                  "5681594.191",
                  "5681594.728",
                  "5681598.560",
                  "5681599.908",
                  "5681603.837",
                  "5681608.106",
                  "5681589.655",
                  "5681587.293",
                  "5681586.948",
                  "5681586.024",
                  "5681584.688",
                  "5681584.126",
                  "5681583.980",
                  "5681581.079",
                ],
              ],
              geometryString:
                '{"rings":[[[374362.1460000016,5681581.079],[374359.0170000009,5681579.273],[374357.3570000008,5681582.103],[374351.7569999993,5681591.651],[374350.2679999992,5681594.191],[374349.9530000016,5681594.728],[374347.70699999854,5681598.56],[374351.2650000006,5681599.908],[374361.62900000066,5681603.837],[374372.8909999989,5681608.106],[374380.04100000113,5681589.655],[374373.91899999976,5681587.293],[374373.0249999985,5681586.948],[374370.6330000013,5681586.024],[374367.1710000001,5681584.688],[374367.42500000075,5681584.126],[374367.1719999984,5681583.98],[374362.1460000016,5681581.079]]]}',
              coordinateX: "374365.392",
              coordinateY: "5681594.513",
              allGeometryX: [
                [
                  "374362.146",
                  "374359.017",
                  "374357.357",
                  "374351.757",
                  "374350.268",
                  "374349.953",
                  "374347.707",
                  "374351.265",
                  "374361.629",
                  "374372.891",
                  "374380.041",
                  "374373.919",
                  "374373.025",
                  "374370.633",
                  "374367.171",
                  "374367.425",
                  "374367.172",
                  "374362.146",
                ],
              ],
            },
            grundbuchvollzug: null,
            administrativeDistricts: {
              regierungsbezirkCode: "051",
              regierungsbezirkName: "Düsseldorf",
              gemarkungCode: "053001",
              gemarkungName: "Barmen",
              gemeindeName: "Wuppertal",
              landParcelCode: "053001-121-00097/0019",
              gemeindeCode: "05124000",
              bundeslandName: "Nordrhein - Westfalen",
              kreisCode: "05124",
              bundeslandCode: "05",
              kreisName: "Wuppertal",
            },
            dateOfContiuance: "2020-05-06T14:50:06Z",
            landAppraisalSegments: null,
            utilizationSegments: null,
            abweichenderRechtszustand: "0",
            classificationSegments: null,
            bodenRaumOrdnungsRecht: null,
            areaSize: "516.0",
            landParcelUUId: "DENW29AL1000B7Ln",
            landParcelCode: "053001-121-00097/0019",
            buchungsstelle: null,
            fdv: null,
            dateOfOrigin: "1800-01-01T00:00:00Z",
            landHolding: null,
            anlassart: {
              anlassartCode: "300900",
              anlassartName:
                "Veränderung der Geometrie durch Implizitbehandlung",
            },
          },
        ],
        parentId: null,
        buchungsart: "Grundstück",
        buchungsblatt: null,
      },
    ],
    blattartCode: "1000",
    blattart: "Grundbuchblatt",
    bezirkCode: null,
    bezirkName: null,
    namensnummern: [
      {
        beschriebRechtsgemeinschaft:
          "Zu 4.1 und 4.2 in Errungenschaftsgemeinschaft nach russischem Recht",
        namensnummernUUIds: ["DENW29AL20000OwD", "DENW29AL20000OwG"],
        artRechtsgemeinschaft: "Sonstiges",
        rechtsgmeinschaftUUId: null,
        zaehler: null,
        nenner: null,
        uuid: "DENW29AL20000OwJ",
        laufendeNummer: null,
        nummer: null,
        eigentuemerart: null,
        eigentuemerUUId: null,
      },
      {
        beschriebRechtsgemeinschaft: null,
        namensnummernUUIds: null,
        artRechtsgemeinschaft: null,
        rechtsgmeinschaftUUId: "DENW29AL20000OwJ",
        zaehler: null,
        nenner: null,
        uuid: "DENW29AL20000OwD",
        laufendeNummer: "4.1",
        nummer: null,
        eigentuemerart: "1000",
        eigentuemerUUId: "DENW29AL20000OwE",
      },
      {
        beschriebRechtsgemeinschaft: null,
        namensnummernUUIds: null,
        artRechtsgemeinschaft: null,
        rechtsgmeinschaftUUId: "DENW29AL20000OwJ",
        zaehler: null,
        nenner: null,
        uuid: "DENW29AL20000OwG",
        laufendeNummer: "4.2",
        nummer: null,
        eigentuemerart: "1000",
        eigentuemerUUId: "DENW29AL20000OwH",
      },
    ],
    offices: {
      buchungsblattCode: "053001-011062 ",
      districtCourtName: ["Wuppertal"],
      forestryOfficeName: null,
      landRegistryOfficeKey: "3290",
      financeOfficeKey: null,
      financeOfficeName: null,
      forestryOfficeKey: null,
      landRegistryOfficeName: [
        "Stadt Wuppertal",
        "Johannes-Rau-Platz 1",
        "42275 Wuppertal",
      ],
      districtCourtKey: "051608",
      landParcelCode: null,
    },
  },
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

  console.log("xxx sheets", sheets);
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
        <div style={colStyle}>Lage:</div>
        <div style={{ ...colStyle, display: "flex", gap: "0.4rem" }}>
          <div>{lage}</div>
          <div style={{ display: "flex", gap: "0.4rem" }}>
            {landparcel.adressenArray.map((a, idx: number) => {
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
        defaultActiveKey="1"
        tabPosition="left"
        items={sheets.map((b, i) => {
          const id = String(i);
          return {
            label: (
              <div style={{ padding: "4px 10px" }}>{b.buchungsblattcode}</div>
            ),
            key: id,
            disabled: i === 28,
            children: (
              <div style={{ display: "flex", gap: "4rem" }}>
                <div>
                  <div>Nr. {b.content.nrCode} auf</div>
                  <div>
                    <div
                      style={{
                        display: "flex",
                        gap: "2rem",
                        justifyContent: "space-between",
                      }}
                    >
                      <div style={linkStyle}>{`${b.buchungsblattcode}`}</div>
                      <div>{`${b.content.laufendeNummer}`}</div>
                    </div>
                  </div>
                </div>
                <div>
                  {b.content.owners.map((owner, idx: number) => {
                    const { salutation, firstName, surName, dateOfBirth } =
                      owner;
                    const date = new Date(dateOfBirth);
                    const day = String(date.getDate()).padStart(2, "0");
                    const month = String(date.getMonth() + 1).padStart(2, "0");
                    const year = date.getFullYear();
                    const formattedDate = `${day}.${month}.${year}`;

                    const { houseNumber, postalCode, city, street } =
                      owner.addresses[0];
                    return (
                      <>
                        <div>{`${salutation} ${firstName || ""} ${surName}, ${
                          salutation !== "Firma" ? "*" + formattedDate : ""
                        }`}</div>
                        <div>{`${street} ${houseNumber}`}</div>
                        <div>{`${postalCode}, ${city}`}</div>
                        <div>(Grundbuchamtliche Anschrift)</div>
                      </>
                    );
                  })}
                </div>
              </div>
            ),
          };
        })}
      />
    </div>
  );
};
