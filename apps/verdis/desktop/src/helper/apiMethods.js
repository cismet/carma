import { landParcelSearchQuery } from "../constants/verdis";

const WUNDA_API = "https://wunda-api.cismet.de";
export const WUNDA_DOMAIN = "WUNDA_BLAU";
export const WUNDA_ENDPOINT =
  WUNDA_API + "/graphql/" + WUNDA_DOMAIN + "/execute";

export const searchLandparcelByName = async (name, jwt) => {
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
      // const url = `http://localhost:3033/renderer/?domain=WUNDA_BLAU&jwt=${jwt}&table=alkis_landparcel&id=${ids}`;
      // fetch(url).catch((error) => {
      //   //  i expect an error here
      // });
    }
    return result;
  } catch (error) {
    console.error("There was a problem with the fetch operation:");
  }
};

export const getAdditionalSheets = (sheetId, jwt) => {
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

export const getAllAdditionalSheets = async (buchungsblattArray, jwt) => {
  const fetchPromises = buchungsblattArray.map((b) => {
    return getAdditionalSheets(b.alkis_buchungsblatt.buchungsblattcode, jwt);
  });
  const results = await Promise.all(fetchPromises);
  return results;
};
