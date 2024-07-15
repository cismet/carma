export const constants = {
  LOADING_FINISHED: 'LOADING_FINISHED',
  LOADING_STARTED: 'LOADING_STARTED',
  LOADING_OVERLAY: 'LOADING_OVERLAY',
  OVERLAY_DELAY: 500,
  ZIP_FILE_NAME_MAPPING: {
    bplaene: 'BPLAN_Plaene_und_Zusatzdokumente',
    aenderungsv: 'FNP_Aenderungsverfahren_und_Zusatzdokumente',
    static: '',
  },
  SIDEBAR_FILENAME_SHORTENER: {
    bplaene: (original: string) => {
      const ret = original
        .replace(/.pdf$/, '')
        .replace(/^BPL_n?a?\d*V?-?(A|B|C)*\d*_(0_)*/, '')
        .replace(/Info_BPlan-Zusatzdokumente_WUP.*/, 'Info Dateinamen');
      //   console.log('SIDEBAR_FILENAME_SHORTENER', original, ret);
      return ret;
    },
    aenderungsv: (original: string) => {
      return original.replace(/.pdf$/, '').replace(/^FNP_n*\d*_\d*(And)*_/, '');
    },
  },
};
