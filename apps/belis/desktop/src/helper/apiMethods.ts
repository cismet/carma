import { SAVE_ENDPOINT } from "../constants/belis";

export const savebauart = async (jwt: string) => {
  try {
    const dataToSave = {
      bezeichnung: "Test Schaltschrank",
      id: 1,
    };
    const formData = new FormData();
    formData.append(
      "taskparams",
      JSON.stringify({
        parameters: {
          className: "gp_entdecken",
          data: JSON.stringify(dataToSave),
        },
      })
    );
    const response = await fetch(SAVE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt}`,
      },
      body: formData,
    });
    console.log(response);
  } catch (error) {
    console.log(error);
  }
};
