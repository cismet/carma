import {
  ENDPOINT,
  anlagengruppeQuery,
  arbeitsprotokollstatusQuery,
  bauartQuery,
  leuchtmittelQuery,
  leitungstypQuery,
  materialLeitungQuery,
  materialMauerlascheQuery,
  querschnittQuery,
  SAVE_ENDPOINT,
  teamQuery,
  tkeyBezirkQuery,
  tkeyDoppelkommandoQuery,
  tkeyEnergielieferantQuery,
  tkeyKennzifferQuery,
  tkeyKlassifizierungQuery,
  tkeyMastartQuery,
  tkeyStrassenschluesselQuery,
  tkeyUnterhaltLeuchteQuery,
  tkeyUnterhaltMastQuery,
  veranlassungsartQuery,
} from "../constants/belis";

export const savebauart = async (jwt: string) => {
  try {
    const dataToSave = {
      bezeichnung: "Test Schaltschrank",
      id: 1,
    };

    const formData = new FormData();
    const taskparams = JSON.stringify({
      parameters: {
        className: "bauart",
        data: JSON.stringify(dataToSave),
      },
    });

    formData.append(
      "taskparams",
      new Blob([taskparams], { type: "application/json" }),
      "taskparams"
    );

    const response = await fetch(SAVE_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
      body: formData,
    });

    console.log(response);
  } catch (error) {
    console.log(error);
  }
};

export const saveTeam = async (
  jwt: string,
  dataToSave: { id: number; name: string }
) => {
  return updateDataByClassName(jwt, "team", dataToSave);
};

export const updateDataByClassName = async <T extends Record<string, unknown>>(
  jwt: string,
  className: string,
  dataToSave: T
) => {
  const formData = new FormData();
  const taskparams = JSON.stringify({
    parameters: {
      className,
      data: JSON.stringify(dataToSave),
    },
  });

  formData.append(
    "taskparams",
    new Blob([taskparams], { type: "application/json" }),
    "taskparams"
  );

  const response = await fetch(SAVE_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
    },
    body: formData,
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `saveObject(${className}) failed: ${response.status} ${text}`
    );
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
};

export const fetchAllBauart = async (jwt: string) => {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({
      query: bauartQuery,
    }),
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`fetchAllBauart failed: ${response.status} ${text}`);
  }

  const json = JSON.parse(text) as {
    data?: { bauart?: Array<{ id: number; bezeichnung: string }> };
    errors?: unknown;
  };

  if (json.errors) {
    throw new Error(
      `fetchAllBauart GraphQL errors: ${JSON.stringify(json.errors)}`
    );
  }

  return json.data?.bauart ?? [];
};

export const fetchAllTeams = async (jwt: string) => {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({
      query: teamQuery,
    }),
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`fetchAllTeams failed: ${response.status} ${text}`);
  }

  const json = JSON.parse(text) as {
    data?: { team?: Array<{ id: number; name: string }> };
    errors?: unknown;
  };

  if (json.errors) {
    throw new Error(
      `fetchAllTeams GraphQL errors: ${JSON.stringify(json.errors)}`
    );
  }

  return json.data?.team ?? [];
};

export const fetchAllQuerschnitt = async (jwt: string) => {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({
      query: querschnittQuery,
    }),
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`fetchAllQuerschnitt failed: ${response.status} ${text}`);
  }

  const json = JSON.parse(text) as {
    data?: { querschnitt?: Array<{ id: number; groesse: string }> };
    errors?: unknown;
  };

  if (json.errors) {
    throw new Error(
      `fetchAllQuerschnitt GraphQL errors: ${JSON.stringify(json.errors)}`
    );
  }

  return json.data?.querschnitt ?? [];
};

export const fetchAllLeuchtmittel = async (jwt: string) => {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({
      query: leuchtmittelQuery,
    }),
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`fetchAllLeuchtmittel failed: ${response.status} ${text}`);
  }

  const json = JSON.parse(text) as {
    data?: {
      leuchtmittel?: Array<{
        id: number;
        lichtfarbe: string;
        hersteller: string;
      }>;
    };
    errors?: unknown;
  };

  if (json.errors) {
    throw new Error(
      `fetchAllLeuchtmittel GraphQL errors: ${JSON.stringify(json.errors)}`
    );
  }

  return json.data?.leuchtmittel ?? [];
};

export const fetchAllUnterhaltMast = async (jwt: string) => {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({
      query: tkeyUnterhaltMastQuery,
    }),
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`fetchAllUnterhaltMast failed: ${response.status} ${text}`);
  }

  const json = JSON.parse(text) as {
    data?: {
      tkey_unterh_mast?: Array<{
        id: number;
        pk: string;
        unterhalt_mast: string;
      }>;
    };
    errors?: unknown;
  };

  if (json.errors) {
    throw new Error(
      `fetchAllUnterhaltMast GraphQL errors: ${JSON.stringify(json.errors)}`
    );
  }

  return json.data?.tkey_unterh_mast ?? [];
};

export const fetchAllMaterialMauerlasche = async (jwt: string) => {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({
      query: materialMauerlascheQuery,
    }),
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `fetchAllMaterialMauerlasche failed: ${response.status} ${text}`
    );
  }

  const json = JSON.parse(text) as {
    data?: {
      material_mauerlasche?: Array<{ id: number; bezeichnung: string }>;
    };
    errors?: unknown;
  };

  if (json.errors) {
    throw new Error(
      `fetchAllMaterialMauerlasche GraphQL errors: ${JSON.stringify(
        json.errors
      )}`
    );
  }

  return json.data?.material_mauerlasche ?? [];
};

export const fetchAllAnlagengruppe = async (jwt: string) => {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({
      query: anlagengruppeQuery,
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`fetchAllAnlagengruppe failed: ${response.status} ${text}`);
  }

  const json = JSON.parse(text) as {
    data?: {
      anlagengruppe?: Array<{
        id: number;
        bezeichnung: string;
        nummer: string;
      }>;
    };
    errors?: unknown;
  };

  if (json.errors) {
    throw new Error(
      `fetchAllAnlagengruppe GraphQL errors: ${JSON.stringify(json.errors)}`
    );
  }

  return json.data?.anlagengruppe ?? [];
};

export const fetchAllUnterhaltLeuchte = async (jwt: string) => {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({
      query: tkeyUnterhaltLeuchteQuery,
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `fetchAllUnterhaltLeuchte failed: ${response.status} ${text}`
    );
  }

  const json = JSON.parse(text) as {
    data?: {
      tkey_unterh_leuchte?: Array<{
        id: number;
        pk: string;
        unterhaltspflichtiger_leuchte: string;
      }>;
    };
    errors?: unknown;
  };

  if (json.errors) {
    throw new Error(
      `fetchAllUnterhaltLeuchte GraphQL errors: ${JSON.stringify(json.errors)}`
    );
  }

  return json.data?.tkey_unterh_leuchte ?? [];
};

export const fetchAllStrassenschluessel = async (jwt: string) => {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({
      query: tkeyStrassenschluesselQuery,
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `fetchAllStrassenschluessel failed: ${response.status} ${text}`
    );
  }

  const json = JSON.parse(text) as {
    data?: {
      tkey_strassenschluessel?: Array<{
        id: number;
        pk: string;
        strasse: string;
      }>;
    };
    errors?: unknown;
  };

  if (json.errors) {
    throw new Error(
      `fetchAllStrassenschluessel GraphQL errors: ${JSON.stringify(
        json.errors
      )}`
    );
  }

  return json.data?.tkey_strassenschluessel ?? [];
};

export const fetchAllEnergielieferant = async (jwt: string) => {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({
      query: tkeyEnergielieferantQuery,
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `fetchAllEnergielieferant failed: ${response.status} ${text}`
    );
  }

  const json = JSON.parse(text) as {
    data?: {
      tkey_energielieferant?: Array<{
        id: number;
        pk: string;
        energielieferant: string;
      }>;
    };
    errors?: unknown;
  };

  if (json.errors) {
    throw new Error(
      `fetchAllEnergielieferant GraphQL errors: ${JSON.stringify(json.errors)}`
    );
  }

  return json.data?.tkey_energielieferant ?? [];
};

export const fetchAllBezirk = async (jwt: string) => {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({
      query: tkeyBezirkQuery,
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`fetchAllBezirk failed: ${response.status} ${text}`);
  }

  const json = JSON.parse(text) as {
    data?: {
      tkey_bezirk?: Array<{ id: number; pk: string; bezirk: string }>;
    };
    errors?: unknown;
  };

  if (json.errors) {
    throw new Error(
      `fetchAllBezirk GraphQL errors: ${JSON.stringify(json.errors)}`
    );
  }

  return json.data?.tkey_bezirk ?? [];
};

export const fetchAllLeitungstyp = async (jwt: string) => {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({
      query: leitungstypQuery,
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`fetchAllLeitungstyp failed: ${response.status} ${text}`);
  }

  const json = JSON.parse(text) as {
    data?: { leitungstyp?: Array<{ id: number; bezeichnung: string }> };
    errors?: unknown;
  };

  if (json.errors) {
    throw new Error(
      `fetchAllLeitungstyp GraphQL errors: ${JSON.stringify(json.errors)}`
    );
  }

  return json.data?.leitungstyp ?? [];
};

export const fetchAllArbeitsprotokollstatus = async (jwt: string) => {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({
      query: arbeitsprotokollstatusQuery,
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `fetchAllArbeitsprotokollstatus failed: ${response.status} ${text}`
    );
  }

  const json = JSON.parse(text) as {
    data?: {
      arbeitsprotokollstatus?: Array<{
        id: number;
        bezeichnung: string;
        schluessel: string;
      }>;
    };
    errors?: unknown;
  };

  if (json.errors) {
    throw new Error(
      `fetchAllArbeitsprotokollstatus GraphQL errors: ${JSON.stringify(
        json.errors
      )}`
    );
  }

  return json.data?.arbeitsprotokollstatus ?? [];
};

export const fetchAllMaterialLeitung = async (jwt: string) => {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({
      query: materialLeitungQuery,
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `fetchAllMaterialLeitung failed: ${response.status} ${text}`
    );
  }

  const json = JSON.parse(text) as {
    data?: {
      material_leitung?: Array<{ id: number; bezeichnung: string }>;
    };
    errors?: unknown;
  };

  if (json.errors) {
    throw new Error(
      `fetchAllMaterialLeitung GraphQL errors: ${JSON.stringify(json.errors)}`
    );
  }

  return json.data?.material_leitung ?? [];
};

export const fetchAllKennziffer = async (jwt: string) => {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({
      query: tkeyKennzifferQuery,
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`fetchAllKennziffer failed: ${response.status} ${text}`);
  }

  const json = JSON.parse(text) as {
    data?: {
      tkey_kennziffer?: Array<{
        id: number;
        beschreibung: string;
        kennziffer: string;
      }>;
    };
    errors?: unknown;
  };

  if (json.errors) {
    throw new Error(
      `fetchAllKennziffer GraphQL errors: ${JSON.stringify(json.errors)}`
    );
  }

  return json.data?.tkey_kennziffer ?? [];
};

export const fetchAllMastart = async (jwt: string) => {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({
      query: tkeyMastartQuery,
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`fetchAllMastart failed: ${response.status} ${text}`);
  }

  const json = JSON.parse(text) as {
    data?: {
      tkey_mastart?: Array<{ id: number; pk: string; mastart: string }>;
    };
    errors?: unknown;
  };

  if (json.errors) {
    throw new Error(
      `fetchAllMastart GraphQL errors: ${JSON.stringify(json.errors)}`
    );
  }

  return json.data?.tkey_mastart ?? [];
};

export const fetchAllVeranlassungsart = async (jwt: string) => {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({
      query: veranlassungsartQuery,
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `fetchAllVeranlassungsart failed: ${response.status} ${text}`
    );
  }

  const json = JSON.parse(text) as {
    data?: {
      veranlassungsart?: Array<{
        id: number;
        bezeichnung: string;
        schluessel: string;
      }>;
    };
    errors?: unknown;
  };

  if (json.errors) {
    throw new Error(
      `fetchAllVeranlassungsart GraphQL errors: ${JSON.stringify(json.errors)}`
    );
  }

  return json.data?.veranlassungsart ?? [];
};

export const fetchAllKlassifizierung = async (jwt: string) => {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({
      query: tkeyKlassifizierungQuery,
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `fetchAllKlassifizierung failed: ${response.status} ${text}`
    );
  }

  const json = JSON.parse(text) as {
    data?: {
      tkey_klassifizierung?: Array<{
        id: number;
        pk: string;
        klassifizierung: string;
      }>;
    };
    errors?: unknown;
  };

  if (json.errors) {
    throw new Error(
      `fetchAllKlassifizierung GraphQL errors: ${JSON.stringify(json.errors)}`
    );
  }

  return json.data?.tkey_klassifizierung ?? [];
};

export const fetchAllDoppelkommando = async (jwt: string) => {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({
      query: tkeyDoppelkommandoQuery,
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `fetchAllDoppelkommando failed: ${response.status} ${text}`
    );
  }

  const json = JSON.parse(text) as {
    data?: {
      tkey_doppelkommando?: Array<{
        id: number;
        pk: string;
        beschreibung: string;
      }>;
    };
    errors?: unknown;
  };

  if (json.errors) {
    throw new Error(
      `fetchAllDoppelkommando GraphQL errors: ${JSON.stringify(json.errors)}`
    );
  }

  return json.data?.tkey_doppelkommando ?? [];
};
