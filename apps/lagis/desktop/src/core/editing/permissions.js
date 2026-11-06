import { REST_SERVICE_LAGIS } from "../../constants/lagis";

// granted = 200 with a non-empty value; any error counts as not granted
export const hasConfigAttribute = async (name, jwt) => {
  try {
    const response = await fetch(
      `${REST_SERVICE_LAGIS}/configattributes/${name}`,
      { headers: { Authorization: `Bearer ${jwt}` } }
    );
    if (response.status !== 200) {
      return false;
    }
    const body = await response.json();
    return Object.values(body ?? {}).some(
      (value) => typeof value === "string" && value.trim().length > 0
    );
  } catch (error) {
    console.warn(`Could not load the right ${name}.`, error);
    return false;
  }
};

export const canUnlockAll = (jwt) =>
  hasConfigAttribute("lagis.permission.unlockall", jwt);

// Java LagisBroker.checkNKFAdminPermissionsOnServer
export const canAdminNkf = (jwt) =>
  hasConfigAttribute("lagis.perm.nkf.admin", jwt);
