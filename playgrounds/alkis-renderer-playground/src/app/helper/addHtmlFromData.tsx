import { Divider, Tabs } from "antd";
import { getAllAdditionalSheets, searchLandparcelByName } from "./getToken";

const tempData = {
  contentType: "application/octet-stream",
  res: {
    id: "DENW29AL1000EZxW",
    multiBuchungsblattUUIds: null,
    descriptionOfRechtsgemeinschaft: null,
    buchungsblattCode: "053001-000200A",
    owners: [
      {
        buchungsblattCode: "053001-000200A",
        akademischergrad: null,
        sonstigeEigenschaft: null,
        part: null,
        addresses: [
          {
            country: "DEUTSCHLAND",
            city: "Wuppertal",
            houseNumber: "36 a",
            pob: null,
            postalCodePOB: null,
            postalCode: "42275",
            street: "Reichsstr.",
            ownerId: "DENW29AL1000EAyf",
            district: null,
            herkunftAdress: "Grundbuchamt",
          },
        ],
        ownerId: "DENW29AL1000EAyf",
        nameOfBirth: null,
        firstName: null,
        dateOfBirth: null,
        namenzusatz: null,
        surName: "Kinderland-Kindergarten, gemeinnützige Gesellschaft mbH",
        dateOfDead: null,
        foreName: null,
        residence: null,
        salutationCode: "3000",
        salutation: "Firma",
        nameNumber: "2",
        kindOfOwner: {
          kindOfOwnerCode: "2000",
          kindOfOwnerName: "Juristische Personen",
        },
        katasterPerson: null,
        representative: null,
      },
    ],
    buchungsstellen: [
      {
        id: "DENW29AL1000EvHv",
        number: "1",
        description: null,
        sequentialNumber: "0001",
        buchungsartCode: "1301",
        buchungsstellen: [
          {
            id: "DENW29AL1000BjPY",
            number: null,
            description: null,
            sequentialNumber: "0001",
            buchungsartCode: "1101",
            buchungsstellen: null,
            landAgents: null,
            fraction: null,
            landParcel: [
              {
                location: {
                  location: null,
                  houseNumbers: ["36", "36 a", "34 a"],
                  minX: "375231.024",
                  maxY: "5681724.075",
                  minY: "5681663.665",
                  maxX: "375267.644",
                  landParcelCode: "053001-137-00020/0001",
                  streetKeys: [
                    "0512400002820",
                    "0512400002820",
                    "0512400002820",
                  ],
                  buildingIds: [
                    "DENW29AL1000B0uQ",
                    "DENW29AL1000BPRS",
                    "DENW29AL1000BLK4",
                  ],
                  streetNames: ["Reichsstraße", "Reichsstraße", "Reichsstraße"],
                  districts: [null, null, null],
                  allGeometryY: [
                    [
                      "5681669.753",
                      "5681663.665",
                      "5681685.685",
                      "5681704.123",
                      "5681724.075",
                      "5681724.018",
                      "5681723.962",
                      "5681723.496",
                      "5681723.387",
                      "5681723.311",
                      "5681711.901",
                      "5681711.255",
                      "5681699.544",
                      "5681676.010",
                      "5681669.753",
                    ],
                  ],
                  geometryString:
                    '{"rings":[[[375249.23699999973,5681669.753],[375231.56799999997,5681663.665],[375231.2719999999,5681685.685],[375231.0240000002,5681704.123],[375231.50499999896,5681724.075],[375234.27600000054,5681724.018],[375236.66000000015,5681723.962],[375258.8040000014,5681723.496],[375263.993999999,5681723.387],[375267.64400000125,5681723.311],[375267.4979999997,5681711.901],[375267.4849999994,5681711.255],[375267.2740000002,5681699.544],[375266.8509999998,5681676.01],[375249.23699999973,5681669.753]]]}',
                  coordinateX: "375249.184",
                  coordinateY: "5681703.764",
                  allGeometryX: [
                    [
                      "375249.237",
                      "375231.568",
                      "375231.272",
                      "375231.024",
                      "375231.505",
                      "375234.276",
                      "375236.660",
                      "375258.804",
                      "375263.994",
                      "375267.644",
                      "375267.498",
                      "375267.485",
                      "375267.274",
                      "375266.851",
                      "375249.237",
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
                  landParcelCode: "053001-137-00020/0001",
                  gemeindeCode: "05124000",
                  bundeslandName: "Nordrhein - Westfalen",
                  kreisCode: "05124",
                  bundeslandCode: "05",
                  kreisName: "Wuppertal",
                },
                dateOfContiuance: "2021-02-12T11:52:24Z",
                landAppraisalSegments: null,
                utilizationSegments: null,
                abweichenderRechtszustand: "0",
                classificationSegments: null,
                bodenRaumOrdnungsRecht: null,
                areaSize: "1938.0",
                landParcelUUId: "DENW29AL1000B4hZ",
                landParcelCode: "053001-137-00020/0001",
                buchungsstelle: null,
                fdv: null,
                dateOfOrigin: "1938-01-01T00:00:00Z",
                landHolding: null,
                anlassart: {
                  anlassartCode: "300900",
                  anlassartName:
                    "Veränderung der Geometrie durch Implizitbehandlung",
                },
              },
            ],
            parentId: "DENW29AL1000EvHv",
            buchungsart: "Aufgeteiltes Grundstück WEG",
            buchungsblatt: null,
          },
        ],
        landAgents: null,
        fraction: "500/1000",
        landParcel: null,
        parentId: null,
        buchungsart: "Wohnungs-/Teileigentum",
        buchungsblatt: null,
      },
    ],
    blattartCode: "1000",
    blattart: "Grundbuchblatt",
    bezirkCode: null,
    bezirkName: null,
    namensnummern: [
      {
        beschriebRechtsgemeinschaft: null,
        namensnummernUUIds: null,
        artRechtsgemeinschaft: null,
        rechtsgmeinschaftUUId: null,
        zaehler: null,
        nenner: null,
        uuid: "DENW29ALxz00002w",
        laufendeNummer: "2",
        nummer: null,
        eigentuemerart: "2000",
        eigentuemerUUId: "DENW29AL1000EAyf",
      },
    ],
    offices: {
      buchungsblattCode: "053001-000200A",
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
