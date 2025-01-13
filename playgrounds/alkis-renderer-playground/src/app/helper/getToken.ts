import { landParcelSearchQuery } from "../verdis";
export type FieldType = {
  username?: string;
  password?: string;
};

const additionalShitsResponse = {
  contentType: "application/octet-stream",
  res: {
    id: "DENW29AL30000JkP",
    multiBuchungsblattUUIds: null,
    descriptionOfRechtsgemeinschaft: null,
    buchungsblattCode: "053001-033391 ",
    owners: [
      {
        buchungsblattCode: "053001-033391 ",
        akademischergrad: "Dr.",
        sonstigeEigenschaft: null,
        part: null,
        addresses: [
          {
            country: "DEUTSCHLAND",
            city: "Radevormwald",
            houseNumber: "2",
            pob: null,
            postalCodePOB: null,
            postalCode: "42477",
            street: "Hardtbach",
            ownerId: "DENW29AL1000EMkY",
            district: null,
            herkunftAdress: "Grundbuchamt",
          },
        ],
        ownerId: "DENW29AL1000EMkY",
        nameOfBirth: null,
        firstName: "Rainer",
        dateOfBirth: "1947-02-08T00:00:00Z",
        namenzusatz: null,
        surName: "Warkus",
        dateOfDead: null,
        foreName: "Rainer",
        residence: null,
        salutationCode: "2000",
        salutation: "Herr",
        nameNumber: "1",
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
        id: "DENW29AL30000JkR",
        number: "2/3",
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
            parentId: "DENW29AL30000JkR",
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
        uuid: "DENW29AL30000JkQ",
        laufendeNummer: "1",
        nummer: null,
        eigentuemerart: "1000",
        eigentuemerUUId: "DENW29AL1000EMkY",
      },
    ],
    offices: {
      buchungsblattCode: "053001-033391 ",
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

const REST_SERVICE = "https://verdis-api.cismet.de";
const DOMAIN = "VERDIS_GRUNDIS";

const temporaryJwt =
  "eyJhbGciOiJSUzI1NiJ9.eyJqdGkiOiIyMCIsInN1YiI6ImFkbWluIiwiZG9tYWluIjoiV1VOREFfQkxBVSIsImh0dHBzOi8vaGFzdXJhLmlvL2p3dC9jbGFpbXMiOnsieC1oYXN1cmEtZGVmYXVsdC1yb2xlIjoidXNlciIsIngtaGFzdXJhLWFsbG93ZWQtcm9sZXMiOlsiZWRpdG9yIiwidXNlciIsIm1vZCJdfX0.AhfIT_Jmsf1-yHbSeAqgMEwR2g3EJ3yZJRQZSyyH4Z4aQn3hYVKLa-YJLlSjgu4OJ4emd5DtPGABlzt3G8GxjtMKjpJo0qaC-G-WIGa42KrHeyS7YVgdtNgdfx72hKJKcFQwlBHwumeRwI8w2fbc0Z2-vuU_yqP4LEOi-TbJHXBTg-844TAfjOfVWuLchXZ96f4Td65W2hbdDTZMR2Wk964I0noDbKsNEvH2FQudg8lo8S-I1-w1wxXPEOSqTIIN9z-1hUf9cB3XA-2_HqB-edVvxR3Qe1sDFXInfs123s09saC9TmhzalAoya3AglyGz9JA6Ct989d24RszHBbOwg";

export const login = (values: FieldType, setJwt: (j: string) => void) => {
  fetch(REST_SERVICE + "/users", {
    method: "GET",
    headers: {
      Authorization:
        "Basic " + btoa(values.username + "@" + DOMAIN + ":" + values.password),
      "Content-Type": "application/json",
    },
  })
    .then(function (response) {
      if (response.status >= 200 && response.status < 300) {
        response.json().then(function (responseWithJWT) {
          const jwt = responseWithJWT.jwt;
          setJwt(jwt);
        });
      } else {
        console.log("xxx error: Bei der Anmeldung ist ein Fehler aufgetreten.");
      }
    })
    .catch(function (err) {
      console.log(
        "xxx error catch: Bei der Anmeldung ist ein Fehler aufgetreten."
      );
    });
};

export const getAdditionalSheets = (
  sheetId: string,
  jwt: string = temporaryJwt
) => {
  const form = new FormData();
  let taskParameters = {
    parameters: {
      BUCHUNGSBLATT: sheetId,
    },
  };

  form.append(
    "taskparams",
    new Blob([JSON.stringify(taskParameters)], { type: "application/json" })
  );

  form.append("file", "BUCHUNGSBLATT");

  const url =
    "https://wunda-api.cismet.de/actions/WUNDA_BLAU.alkisRestTunnelAction/tasks?resultingInstanceType=result";

  return fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
    },
    body: form,
  })
    .then((response) => {
      if (response.status >= 200 && response.status < 300) {
        const res = response.json();
        return res;
      } else {
        console.log(
          "xxx Error:" + response.status + " -> " + response.statusText
        );
      }
    })
    .catch((e) => {
      console.log("xxx error", e);
    })
    .then((result) => {
      const owner = additionalShitsResponse.res.owners[0];
      const { salutation, firstName, surName, dateOfBirth } = owner;

      const date = new Date(dateOfBirth);
      const day = String(date.getDate()).padStart(2, "0");
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const year = date.getFullYear();
      const formattedDate = `${day}.${month}.${year}`;

      const { houseNumber, postalCode, city } =
        additionalShitsResponse.res.owners[0].addresses[0];

      console.log("xxx sheets res", {
        salutation,
        firstName,
        surName,
        formattedDate,
        houseNumber,
        postalCode,
        city,
      });
      return {
        buchungsblattcode: additionalShitsResponse.res.buchungsblattCode,
        content: {
          salutation,
          firstName,
          surName,
          formattedDate,
          houseNumber,
          postalCode,
          city,
        },
      };
    });
};

interface AdditionalShits {
  alkis_buchungsblatt: {
    id: number;
    buchungsblattcode: string;
  };
}

export const getAllAdditionalSheets = async (
  jwt: string,
  buchungsblattArray: AdditionalShits[]
) => {
  const fetchPromises = buchungsblattArray.map((b) => {
    return getAdditionalSheets(b.alkis_buchungsblatt.buchungsblattcode);
  });
  const results = await Promise.all(fetchPromises);
  console.log("xxx promise all", results);
  return results;
};

const WUNDA_API = "https://wunda-api.cismet.de";
export const WUNDA_DOMAIN = "WUNDA_BLAU";
export const WUNDA_ENDPOINT =
  WUNDA_API + "/graphql/" + WUNDA_DOMAIN + "/execute";

export const getLandparcelById = (name: string, jwt: string) => {
  fetch(WUNDA_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({
      query: landParcelSearchQuery,
      variables: { name },
    }),
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error("Network response was not ok");
      }
      return response.json();
    })
    .then((result) => {
      const ids = result.data.alkis_landparcel[0].id;
      const bezeichnung = result.data.alkis_landparcel[0].bezeichnung;
      // const url = `http://localhost:3033/renderer/?domain=WUNDA_BLAU&jwt=${jwt}&table=alkis_landparcel&id=${ids}`;
      // fetch(url).catch((error) => {
      //   //  i expect an error here
      // });

      // console.log("xxx res ids + bez", ids, bezeichnung);
      console.log("xxx res", result);
      getAdditionalSheets("053001-033391 ");
    })
    .catch((error) => {
      console.error(
        "There was a problem with the fetch operation:",
        error.message
      );
    });
};
