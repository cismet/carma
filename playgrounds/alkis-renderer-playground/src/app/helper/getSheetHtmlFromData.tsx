import { Divider, Tabs } from "antd";
import {
  getAdditionalSheetAsync,
  getAllAdditionalSheets,
  getBookingOfficesBySheetId,
  searchLandparcelByName,
} from "./getToken";
import AdditionalSheet from "../components/AdditionalSheet";
import CustomCard from "../components/CustomCard";

const tem053001Data033389 = {
  contentType: "application/octet-stream",
  res: {
    id: "DENW29AL30000JkJ",
    multiBuchungsblattUUIds: null,
    descriptionOfRechtsgemeinschaft: null,
    buchungsblattCode: "053001-033389 ",
    owners: [
      {
        buchungsblattCode: "053001-033389 ",
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
        id: "DENW29AL30000JkL",
        number: "2/1",
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
            parentId: "DENW29AL30000JkL",
            buchungsart: "Aufgeteiltes Grundstück WEG",
            buchungsblatt: null,
          },
        ],
        landAgents: null,
        fraction: "100/1000",
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
        uuid: "DENW29ALGn00004I",
        laufendeNummer: "2",
        nummer: null,
        eigentuemerart: "2000",
        eigentuemerUUId: "DENW29AL1000EAyf",
      },
    ],
    offices: {
      buchungsblattCode: "053001-033389 ",
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

export const getSheetHtml = async (jwt: string, name: string) => {
  const sheetData = await getAdditionalSheetAsync(name, jwt);
  const booking = await getBookingOfficesBySheetId(name + " ", jwt);
  const bookingOff = booking.data.alkis_buchungsblatt[0].landparcelsArray;
  const localCourt = sheetData.res.offices.districtCourtName[0];
  const markingName =
    sheetData?.res?.buchungsstellen?.[0]?.landParcel?.[0]
      ?.administrativeDistricts?.gemarkungName ?? null;

  const markingCode =
    sheetData?.res?.buchungsstellen?.[0]?.landParcel?.[0]
      ?.administrativeDistricts?.gemarkungCode ?? null;

  const leafType = sheetData.res.blattart;
  const bookingType = sheetData.res.buchungsstellen[0].buchungsart;
  console.log("xxx sheet data", JSON.stringify(sheetData));

  return (
    <div>
      <CustomCard title="Buchungsblatt">
        <CustomCard style={{ marginBottom: "1rem" }} title="Buchungsblatt">
          <div>
            <div>Amtsgericht: {localCourt}</div>
            {markingName && markingCode && (
              <div>
                Grundbuchbezirk: {markingName} ({markingCode})
              </div>
            )}
            <div>Blattart: {leafType}</div>
            <div>Buchungsart: {bookingType}</div>
          </div>
        </CustomCard>
        <CustomCard style={{ marginBottom: "1rem" }} title="Eigentümer">
          <AdditionalSheet
            owners={sheetData.res.owners}
            namesArr={sheetData.res.namensnummern}
            legalDesc={sheetData.res.descriptionOfRechtsgemeinschaft}
          />
        </CustomCard>
        <CustomCard title="Buchungsstellen und Flurstücke">
          <div>
            {bookingOff.map((o, idx: number) => {
              return (
                <div key={idx}>
                  {o.alkis_buchungsblatt_landparcel.lfn}{" "}
                  {o.alkis_buchungsblatt_landparcel.landparcelcode}
                </div>
              );
            })}
          </div>
        </CustomCard>
      </CustomCard>
    </div>
  );
};
