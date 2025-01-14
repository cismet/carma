import { landParcelSearchQuery } from "../verdis";
export type FieldType = {
  username?: string;
  password?: string;
};

const REST_SERVICE = "https://verdis-api.cismet.de";
const DOMAIN = "VERDIS_GRUNDIS";

const temporaryJwt =
  "eyJhbGciOiJSUzI1NiJ9.eyJqdGkiOiIyMCIsInN1YiI6ImFkbWluIiwiZG9tYWluIjoiV1VOREFfQkxBVSIsImh0dHBzOi8vaGFzdXJhLmlvL2p3dC9jbGFpbXMiOnsieC1oYXN1cmEtZGVmYXVsdC1yb2xlIjoidXNlciIsIngtaGFzdXJhLWFsbG93ZWQtcm9sZXMiOlsiZWRpdG9yIiwidXNlciIsIm1vZCJdfX0.i6TWWeqa_X1_WXIY4Wb5HYaHZ15sr3_DnIBvZNDird3HggB67mXwkMYezkB2o6BU47GYQuUm3lJDY-YVPVM7Ae6f7WwNum_C8RWKCgoL-bEInLOzvLqYr9OSLJarO9Bs6CaN75aWdYhA2Yrr8SYV7dQsuiz9x8eQ1Kj8VE5Z4uuN2lQGM0k1frhlIihJxIoSzIWufJv3wLQ3FBKkn6XQ5xJJwSIT9GDGYRSG1X28ML3jOSfexTwAK1hn0f2TvHpOzvOuEWVoP2HGzs1OohzEPMud6iRNMCahTCcYytd9FNJrK1RLWFs-reVmGGmOYVprHTmMfCIAUtKnyObyXJ5nCQ";
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
      console.log("xxx one sheet", result);
      const owner = result.res.owners[0];
      const { salutation, firstName, surName, dateOfBirth } = owner;

      const date = new Date(dateOfBirth);
      const day = String(date.getDate()).padStart(2, "0");
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const year = date.getFullYear();
      const formattedDate = `${day}.${month}.${year}`;

      const { houseNumber, postalCode, city, street } =
        result.res.owners[0].addresses[0];

      const { laufendeNummer } = result.res.namensnummern[0];

      return {
        buchungsblattcode: result.res.buchungsblattCode,
        content: {
          salutation,
          firstName,
          surName,
          formattedDate,
          houseNumber,
          postalCode,
          city,
          street,
          laufendeNummer,
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
  // jwt: string,
  buchungsblattArray: AdditionalShits[]
) => {
  const fetchPromises = buchungsblattArray.map((b) => {
    return getAdditionalSheets(b.alkis_buchungsblatt.buchungsblattcode);
  });
  const results = await Promise.all(fetchPromises);
  return results;
};

const WUNDA_API = "https://wunda-api.cismet.de";
export const WUNDA_DOMAIN = "WUNDA_BLAU";
export const WUNDA_ENDPOINT =
  WUNDA_API + "/graphql/" + WUNDA_DOMAIN + "/execute";

export const getLandparcelById = async (name: string) => {
  const temJwt =
    "eyJhbGciOiJSUzI1NiJ9.eyJqdGkiOiIyMCIsInN1YiI6ImFkbWluIiwiZG9tYWluIjoiV1VOREFfQkxBVSIsImh0dHBzOi8vaGFzdXJhLmlvL2p3dC9jbGFpbXMiOnsieC1oYXN1cmEtZGVmYXVsdC1yb2xlIjoidXNlciIsIngtaGFzdXJhLWFsbG93ZWQtcm9sZXMiOlsiZWRpdG9yIiwidXNlciIsIm1vZCJdfX0.AhfIT_Jmsf1-yHbSeAqgMEwR2g3EJ3yZJRQZSyyH4Z4aQn3hYVKLa-YJLlSjgu4OJ4emd5DtPGABlzt3G8GxjtMKjpJo0qaC-G-WIGa42KrHeyS7YVgdtNgdfx72hKJKcFQwlBHwumeRwI8w2fbc0Z2-vuU_yqP4LEOi-TbJHXBTg-844TAfjOfVWuLchXZ96f4Td65W2hbdDTZMR2Wk964I0noDbKsNEvH2FQudg8lo8S-I1-w1wxXPEOSqTIIN9z-1hUf9cB3XA-2_HqB-edVvxR3Qe1sDFXInfs123s09saC9TmhzalAoya3AglyGz9JA6Ct989d24RszHBbOwg";
  fetch(WUNDA_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${temJwt}`,
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
      return result;
    })
    .catch((error) => {
      console.error(
        "There was a problem with the fetch operation:",
        error.message
      );
    });
};

export const searchLandparcelByName = async (name: string) => {
  const temJwt =
    "eyJhbGciOiJSUzI1NiJ9.eyJqdGkiOiIyMCIsInN1YiI6ImFkbWluIiwiZG9tYWluIjoiV1VOREFfQkxBVSIsImh0dHBzOi8vaGFzdXJhLmlvL2p3dC9jbGFpbXMiOnsieC1oYXN1cmEtZGVmYXVsdC1yb2xlIjoidXNlciIsIngtaGFzdXJhLWFsbG93ZWQtcm9sZXMiOlsiZWRpdG9yIiwidXNlciIsIm1vZCJdfX0.i6TWWeqa_X1_WXIY4Wb5HYaHZ15sr3_DnIBvZNDird3HggB67mXwkMYezkB2o6BU47GYQuUm3lJDY-YVPVM7Ae6f7WwNum_C8RWKCgoL-bEInLOzvLqYr9OSLJarO9Bs6CaN75aWdYhA2Yrr8SYV7dQsuiz9x8eQ1Kj8VE5Z4uuN2lQGM0k1frhlIihJxIoSzIWufJv3wLQ3FBKkn6XQ5xJJwSIT9GDGYRSG1X28ML3jOSfexTwAK1hn0f2TvHpOzvOuEWVoP2HGzs1OohzEPMud6iRNMCahTCcYytd9FNJrK1RLWFs-reVmGGmOYVprHTmMfCIAUtKnyObyXJ5nCQ";
  try {
    const response = await fetch(WUNDA_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${temJwt}`,
      },
      body: JSON.stringify({
        query: landParcelSearchQuery,
        variables: { name },
      }),
    });

    if (!response.ok) {
      throw new Error("Network response was not ok");
    }

    const result = await response.json();
    console.log("xxx l name", result);
    return result;
  } catch (error) {
    console.error("There was a problem with the fetch operation:");
  }
};
