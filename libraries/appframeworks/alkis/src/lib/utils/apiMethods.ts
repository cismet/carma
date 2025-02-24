import { TaskParameters } from "../../";
import {
  landparcelForPointGeomQuery,
  landParcelSearchQuery,
  sheetSearchQuery,
} from "../utils/graphqlService";

const WUNDA_API = "https://wunda-api.cismet.de";
export const WUNDA_DOMAIN = "WUNDA_BLAU";
export const WUNDA_ENDPOINT =
  WUNDA_API + "/graphql/" + WUNDA_DOMAIN + "/execute";

export const searchLandparcelByName = async (
  name,
  jwt,
  setError,
  setIsLoading
) => {
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
      setIsLoading(false);
      setError("Fehler: keine Daten gefunden");
      throw new Error("Network response was not ok");
    }

    const result = await response.json();
    if (result) {
      const ids = result.data.alkis_landparcel[0].id;
      // const url = `http://localhost:3033/renderer/?domain=WUNDA_BLAU&jwt=${jwt}&table=alkis_landparcel&id=${ids}`;
      // fetch(url).catch((error) => {
      //   //  i expect an error here
      // });
      setIsLoading(false);
      setError(null);
    }
    return result;
  } catch (error) {
    setIsLoading(false);
    setError("Fehler: keine Daten gefunden");
    console.error("There was a problem with the fetch operation:");
  }
};

export const getAdditionalSheets = (sheetId, jwt, setError, setIsLoading) => {
  setIsLoading(true);
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
        setIsLoading(false);
        setError(null);
        return res;
      } else {
        setIsLoading(false);
        setError("Fehler: keine Daten gefunden");
        console.log(
          "xxx Error:" + response.status + " -> " + response.statusText
        );
      }
    })
    .catch((e) => {
      setIsLoading(false);
      setError("Fehler: keine Daten gefunden");
      console.log("xxx error", e);
    })
    .then((result) => {
      const owners = result.res.owners;
      const nrCode = result.res.buchungsstellen[0].sequentialNumber;
      const legalDesc = result.res.descriptionOfRechtsgemeinschaft;
      const namesArr = result.res.namensnummern;
      setIsLoading(false);
      setError(null);

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

export const getAllAdditionalSheets = async (
  buchungsblattArray,
  jwt,
  setError,
  setIsLoading
) => {
  const fetchPromises = buchungsblattArray.map((b) => {
    return getAdditionalSheets(
      b.alkis_buchungsblatt.buchungsblattcode,
      jwt,
      setError,
      setIsLoading
    );
  });
  const results = await Promise.all(fetchPromises);
  return results;
};

export const getAdditionalSheetAsync = async (
  sheetId,
  jwt,
  setError,
  setIsLoading
) => {
  setIsLoading(true);

  const form = new FormData();
  const taskParameters = {
    parameters: {
      BUCHUNGSBLATT: sheetId.trim(),
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
      setIsLoading(false);
      setError(null);
      return result;
    } else {
      setIsLoading(false);
      setError("Fehler: keine Daten gefunden");
      console.log(
        "xxx Error: " + response.status + " -> " + response.statusText
      );
    }
  } catch (error) {
    setIsLoading(false);
    setError("Fehler: keine Daten gefunden");
    console.log("xxx error", error);
  }
};

export const getBookingOfficesBySheetId = async (
  name,
  jwt,
  setError,
  setIsLoading
) => {
  setIsLoading(true);
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
      setIsLoading(false);
      setError("Fehler: keine Daten gefunden"),
        console.log(
          "xxx Error: " + response.status + " -> " + response.statusText
        );
    }
    const result = await response.json();
    setIsLoading(false);
    setError(null);
    return result;
  } catch (error) {
    setIsLoading(false);
    setError("Fehler: keine Daten gefunden"),
      console.error("There was a problem with the fetch operation:");
  }
};

export const checkPdfProductPermission = async (
  configurationAttribute = "custom.alkis.product.flurstuecksnachweis",
  jwt,
  setError,
  setIsLoading
) => {
  setIsLoading(true);
  const url = `https://wunda-api.cismet.de/configattributes/${configurationAttribute}@WUNDA_BLAU`;
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "multipart/form-data",
        Authorization: `Bearer ${jwt}`,
      },
    });

    if (!response.ok) {
      setIsLoading(false);

      throw new Error("Network response was not ok");
    }

    const result = await response.json();
    setIsLoading(false);

    return result;
  } catch (error) {
    setIsLoading(false);

    console.error("There was a problem with the fetch operation:");
  }
};

export const loadPdfProduct = async (
  sheetId,
  loadingAttribute,
  type,
  jwt,
  time
) => {
  const form = new FormData();
  const taskParameters: TaskParameters = {
    parameters: {
      ALKIS_CODE: `${sheetId}`,
    },
  };

  if (type !== "Karte" && type !== "Stichtagsbezogen") {
    taskParameters.parameters.PRODUKT = `${loadingAttribute}`;
    form.append("file", "EINZELNACHWEIS");
  } else if (type === "Stichtagsbezogen") {
    form.append("file", "EINZELNACHWEIS_STICHTAG");
    taskParameters.parameters.STICHTAG = `${time}`;
    taskParameters.parameters.PRODUKT = `${loadingAttribute}`;
  } else {
    form.append("file", "KARTE");
  }

  form.append(
    "taskparams",
    new Blob([JSON.stringify(taskParameters)], { type: "application/json" })
  );

  const url =
    "https://wunda-api.cismet.de/actions/WUNDA_BLAU.alkisProduct/tasks?resultingInstanceType=result";

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
        "xxx Error: " + response.status + " -> " + response.statusText
      );
    }
  } catch (error) {
    console.log("xxx error", error);
  }
};

export const productsPdfWithPermission = async (
  jwt,
  products,
  isAlkisProduct,
  isBillingMode,
  setError,
  setIsLoading
) => {
  const copyProducts = JSON.parse(JSON.stringify(products));
  if (isAlkisProduct !== null && isBillingMode === null) {
    for (const product of copyProducts) {
      try {
        const result = await checkPdfProductPermission(
          product.configurationAttribute,
          jwt,
          setError,
          setIsLoading
        );
        product.permission =
          result[product.configurationAttribute + "@WUNDA_BLAU"];
      } catch (error) {
        console.error(
          `Error fetching permission for product ${product.name}:`,
          error
        );
        product.fetchError = error;
      }
    }

    return copyProducts;
  }

  return copyProducts;
};

export const searchWithPoints = (searchParams, jwt) => {
  fetch(WUNDA_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({
      query: landparcelForPointGeomQuery,
      variables: searchParams,
    }),
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error("Network response was not ok");
      }
      return response.json();
    })
    .then((result) => {
      const id = result.data.alkis_landparcel[0].alkis_id;
      const baseUrl = window.location.origin + window.location.pathname;
      const url = `${baseUrl}#/alkis-flurstueck/?id=${id}`;
      window.open(url, "_blank");
    })
    .catch((error) => {
      console.error(
        "There was a problem with the fetch operation:",
        error.message
      );
    });
};
