const VERDISONLINEVERSION = '%VERDIS_ONLINE_VERSION%';
const VERDISONLINEHASH = '#%VERDIS_ONLINE_HASH%';
/* eslint-disable no-useless-concat */
export const getVersion = () => {
  if (VERDISONLINEVERSION === '%VERDIS_ONLINE' + '_' + 'VERSION%') {
    return 'dev-hot-reload';
  } else {
    return VERDISONLINEVERSION;
  }
};
export const getMapHash = () => {
  if (VERDISONLINEHASH === '%VERDIS_ONLINE' + '_' + 'HASH%') {
    return '#dev-hot-reload';
  } else {
    return VERDISONLINEHASH;
  }
};
