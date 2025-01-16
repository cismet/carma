import { landParcelSearchQuery, sheetSearchQuery } from "../verdis";
export type FieldType = {
  username?: string;
  password?: string;
};

const REST_SERVICE = "https://verdis-api.cismet.de";
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

export const getAdditionalSheets = (sheetId: string, jwt: string) => {
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
      const owners = result.res.owners;
      const nrCode = result.res.buchungsstellen[0].sequentialNumber;
      const legalDesc = result.res.descriptionOfRechtsgemeinschaft;
      const namesArr = result.res.namensnummern;

      return {
        buchungsblattcode: result.res.buchungsblattCode,
        content: {
          owners,
          nrCode,
          legalDesc,
          namesArr,
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
  buchungsblattArray: AdditionalShits[],
  jwt: string
) => {
  const fetchPromises = buchungsblattArray.map((b) => {
    return getAdditionalSheets(b.alkis_buchungsblatt.buchungsblattcode, jwt);
  });
  const results = await Promise.all(fetchPromises);
  return results;
};

const WUNDA_API = "https://wunda-api.cismet.de";
export const WUNDA_DOMAIN = "WUNDA_BLAU";
export const WUNDA_ENDPOINT =
  WUNDA_API + "/graphql/" + WUNDA_DOMAIN + "/execute";

export const getLandparcelById = async (name: string, jwt: string) => {
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
      return result;
    })
    .catch((error) => {
      console.error(
        "There was a problem with the fetch operation:",
        error.message
      );
    });
};

export const searchLandparcelByName = async (name: string, jwt: string) => {
  try {
    const response = await fetch(WUNDA_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt}`,
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
    if (result) {
      const ids = result.data.alkis_landparcel[0].id;
      const url = `http://localhost:3033/renderer/?domain=WUNDA_BLAU&jwt=${jwt}&table=alkis_landparcel&id=${ids}`;
      fetch(url).catch((error) => {
        //  i expect an error here
      });
    }
    return result;
  } catch (error) {
    console.error("There was a problem with the fetch operation:");
  }
};

export const getAdditionalSheetAsync = async (sheetId: string, jwt: string) => {
  const form = new FormData();
  const taskParameters = {
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

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
      body: form,
    });

    if (response.status >= 200 && response.status < 300) {
      const result = await response.json();

      return result;
    } else {
      console.log(
        "xxx Error:" + response.status + " -> " + response.statusText
      );
    }
  } catch (e) {
    console.log("xxx error", e);
  }
};

export const getBookingOfficesBySheetId = async (name: string, jwt: string) => {
  try {
    const response = await fetch(WUNDA_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({
        query: sheetSearchQuery,
        variables: { name },
      }),
    });

    if (!response.ok) {
      throw new Error("Network response was not ok");
    }

    const result = await response.json();

    return result;
  } catch (error) {
    console.error("There was a problem with the fetch operation:");
  }
};
