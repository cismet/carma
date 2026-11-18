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

export const READ_ONLY_TEXT =
  "Sie haben nur Leserechte. Bearbeiten ist nicht möglich.";

export const canReadWrite = (jwt) =>
  hasConfigAttribute("lagis.permission.readwrite", jwt);

export const canUnlockAll = (jwt) =>
  hasConfigAttribute("lagis.permission.unlockall", jwt);

// Java LagisBroker.checkNKFAdminPermissionsOnServer
export const canAdminNkf = (jwt) =>
  hasConfigAttribute("lagis.perm.nkf.admin", jwt);
