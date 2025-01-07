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
      BUCHUNGSBLATT: sheetId,
    },
  };

  form.append(
    "taskparams",
    new Blob([JSON.stringify(taskParameters)], { type: "application/json" })
  );

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
      return result;
    });
};

interface AdditionalShits {
  alkis_buchungsblatt: {
    id: number;
    buchungsblattcode: string;
  };
}

const getAllAdditionalShits = async (
  jwt: string,
  buchungsblattArray: AdditionalShits[]
) => {
  const fetchPromises = buchungsblattArray.map((b) => {
    return getAdditionalShits(jwt, b.alkis_buchungsblatt.buchungsblattcode);
  });
  const results = await Promise.all(fetchPromises);

  return results;
};
