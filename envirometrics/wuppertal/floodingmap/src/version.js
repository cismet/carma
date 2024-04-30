const APPVERSION = '%APPLICATION_VERSION%';
const APPHASH = '#%APPLICATION_HASH%';

export const getApplicationVersion = () => {
  /*eslint-disable no-useless-concat*/
  if (APPVERSION === '%APPLICATION' + '_' + 'VERSION%') {
    return 'dev-hot-reload';
  } else {
    return APPVERSION;
  }
};
export const getApplicationHash = () => {
  if (APPHASH === '%APPLICATION' + '_' + 'HASH%') {
    return '#dev-hot-reload';
  } else {
    return APPHASH;
  }
};
