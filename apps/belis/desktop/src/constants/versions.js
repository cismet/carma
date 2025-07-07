const BELISVERSION = "%BELIS_VERSION%";
const BELISHASH = "#%BELIS_HASH%";

export const getBelisVersion = () => {
  /*eslint-disable no-useless-concat*/
  if (BELISVERSION === "%BELIS" + "_" + "VERSION%") {
    return "dev-hot-reload";
  } else {
    return BELISVERSION;
  }
};
export const getBelisHash = () => {
  if (BELISHASH === "%BELIS" + "_" + "HASH%") {
    return "#dev-hot-reload";
  } else {
    return BELISHASH;
  }
};
