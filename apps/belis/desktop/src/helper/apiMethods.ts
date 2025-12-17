import {
  ENDPOINT,
  bauartQuery,
  SAVE_ENDPOINT,
  teamQuery,
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
  const formData = new FormData();
  const taskparams = JSON.stringify({
    parameters: {
      className: "team",
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
    throw new Error(`saveTeam failed: ${response.status} ${text}`);
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
