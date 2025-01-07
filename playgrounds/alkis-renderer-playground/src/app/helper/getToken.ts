export type FieldType = {
  username?: string;
  password?: string;
};

export const REST_SERVICE = "https://verdis-api.cismet.de";
const DOMAIN = "VERDIS_GRUNDIS";

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

export const getAdditionalShits = (jwt: string, sheetId: string) => {
  const form = new FormData();
  let taskParameters = {
    parameters: {
      // BODY: "STRING_AS_BYTE_ARRAY",
      BUCHUNGSBLATT: sheetId,
      // TYPE: "FLAECHEN",
      // MAP_FORMAT:
      //   format === "optimal"
      //     ? "A4"
      //     : format + orientation === "optimal"
      //     ? ""
      //     : orientation,
      // HINTS: hints || "",
      // MAP_SCALE: scale === "optimal" ? "1000" : scale || "1000",
      // ABLUSSWIRKSAMKEIT: drainEffectiveness ? "TRUE" : "FALSE",
    },
  };

  const blobParams = new Blob([JSON.stringify(taskParameters)], {
    type: "application/json",
  });
  console.log("xxx blobParams", blobParams);

  form.append(
    "taskparams",
    // "053001-033390"
    new Blob([JSON.stringify(taskParameters)], { type: "application/json" })
  );

  fetch(
    "https://verdis-api.cismet.de/actions/VERDIS_GRUNDIS.EBReport/tasks?resultingInstanceType=result",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
      body: form,
      // body: JSON.stringify({
      //   taskparams: "053001-033390",
      // }),
    }
  )
    .then((response) => {
      if (response.status >= 200 && response.status < 300) {
        const res = response.json();
        console.log("xxx res", res);
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
      // let byteCharacters = atob(result.res);

      console.log("xxx double res", result);
    });
};
