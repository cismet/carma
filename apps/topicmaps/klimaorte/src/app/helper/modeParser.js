export const appModes = {
  ORTE: "ORTE",
  ROUTEN: "ROUTEN",
};

export const getMode = () => {
  const { mode } = parseWindowLocation();
  return mode;
};

const parseWindowLocation = () => {
  const hash = window.location.hash;
  const results = hash.split("?");
  const query = "?" + results[1];
  const modeString = results[0];
  let mode = appModes.ORTE;
  if (modeString.endsWith("routen")) {
    mode = appModes.ROUTEN;
  }
  return { hash, query, mode };
};

export const getModeUrl = (targetMode) => {
  const { query } = parseWindowLocation();
  if (targetMode === appModes.ORTE) {
    return window.location.origin + window.location.pathname + "#/orte" + query;
  } else if (targetMode === appModes.ROUTEN) {
    return window.location.origin + window.location.pathname + "#/routen" + query;
  }
};
