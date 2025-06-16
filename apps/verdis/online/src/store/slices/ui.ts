import { createSlice } from "@reduxjs/toolkit";
import { DOMAIN, SERVICE } from "../../constants/cids";
import {
  WAITING_TYPE_INFO,
  WAITING_TYPE_MESSAGE,
  appModes,
} from "../../constants/ui";

type DrawMode = "default" | "polygon" | "marker" | "edit-feature";

export const types = {
  TOGGLE_INFO_ELEMENTS: "UI_STATE/TOGGLE_INFO_ELEMENTS",
  TOGGLE_CHART_ELEMENTS: "UI_STATE/TOGGLE_CHART_ELEMENTS",
  TOGGLE_KANAL_ELEMENTS: "UI_STATE/TOGGLE_KANAL_ELEMENTS",
  TOGGLE_FILTER_ELEMENT: "UI_STATE/TOGGLE_FILTER_ELEMENT",
  TOGGLE_DETAIL_ELEMENTS: "UI_STATE/TOGGLE_DETAIL_ELEMENTS",
  TOGGLE_CONTACT_ELEMENT: "UI_STATE/TOGGLE_CONTACT_ELEMENT",
  CHANGE_LAYER_OPACITY: "UI_STATE/CHANGE_LAYER_OPACITY",
  CHANGE_LAYER_ENABLED: "UI_STATE/CHANGE_LAYER_ENABLED",
  SHOW_SETTINGS: "UI_STATE/SHOW_SETTINGS",
  SHOW_CHANGE_REQUESTS: "UI_STATE/SHOW_CHANGE_REQUESTS",
  SHOW_CHANGE_REQUESTS_EDIT_UI: "UI_STATE/SHOW_CHANGE_REQUESTS_EDIT_UI",
  SET_CHANGE_REQUESTS_EDIT_MODE: "SET_CHANGE_REQUESTS_EDIT_MODE",
  SET_CHANGE_REQUESTS_EDIT_UI_FLAECHE_AND_CR:
    "UI_STATE/SET_CHANGE_REQUESTS_EDIT_UI_FLAECHE_AND_CR",

  SHOW_WAITING: "UI_STATE/SHOW_WAITING",
  SET_KASSENZEICHEN_SEARCH_IN_PROGRESS:
    "UI_STATE/SET_KASSENZEICHEN_SEARCH_IN_PROGRESS",
  SET_KASSENZEICHEN_TEXTSEARCH_VISIBLE:
    "UI_STATE/SET_KASSENZEICHEN_TEXTSEARCH_VISIBLE",
  SET_KASSENZEICHEN_TOSEARCH_FOR: "UI_STATE/SET_KASSENZEICHEN_TOSEARCH_FOR",
  SCREEN_RESIZE: "UI_STATE/SCREEN_RESIZE",
  SET_MODE: "UI_STATE/SET_MODE",
  SET_D3_AVAILABILITY: "UI_STATE/SET_D3_AVAILABILITY",
  SET_STAC_INPUT: "UI_STATE/SET_STAC_INPUT",
  SET_FEB_BLOB: "UI_STATE/SET_FEB_BLOB",
  SET_WAIT4FEB: "UI_STATE/SET_WAIT4FEB",
  SET_APPLICATION_MENU_ACTIVE_KEY: "UISTATE/SET_APPLICATION_MENU_ACTIVE_KEY",
  SET_CLOUD_STORAGE_STATUS: "UISTATE/SET_CLOUD_STORAGE_STATUS",

  SHOW_CHANGE_REQUESTS_ANNOTATION_EDIT_UI:
    "UI_STATE/SHOW_CHANGE_REQUESTS_ANNOTATION_EDIT_UI",
  SET_CHANGE_REQUESTS_ANNOTATION_EDIT_UI_ANNOTATION_AND_CR:
    "UI_STATE/SET_CHANGE_REQUESTS_ANNOTATION_EDIT_UI_ANNOTATION_AND_CR",
  SET_ERROR: "UI_STATE/SET_ERROR",
  SET_ERROR_MESSAGES: "UI_STATE/SET_ERROR_MESSAGES",
  SET_CONF_DATA: "UI_STATE/SET_CONF_DATA",
  SET_HINT_VISIBLE: "UI_STATE/SET_HINT_VISIBLE",
};

export const CLOUDSTORAGESTATES = {
  CLOUD_STORAGE_UP: "CLOUD_STORAGE_UP",
  CLOUD_STORAGE_DOWN: "CLOUD_STORAGE_DOWN",
  CLOUD_STORAGE_ERROR: "CLOUD_STORAGE_ERROR",
};

const initialState = {
  width: -1,
  height: -1,
  mainMode: appModes.VERSIEGELTE_FLAECHEN,
  mode: appModes.VERSIEGELTE_FLAECHEN,
  infoElementsEnabled: true,
  chartElementsEnabled: true,
  kanalElementsEnabled: false,
  filterElementEnabled: false,
  detailElementsEnabled: true,
  contactElementEnabled: true,

  settingsVisible: false,
  changeRequestsMenuVisible: false,
  changeRequestsEditMode: false,
  changeRequestDisplayMode: "cr",

  changeRequestEditViewVisible: false,
  changeRequestEditViewFlaeche: {},
  changeRequestEditViewCR: {},

  changeRequestAnnotationEditViewVisible: false,
  changeRequestAnnotationEditViewAnnotation: {},
  changeRequestAnnotationEditViewCR: {},

  applicationMenuVisible: false,
  applicationMenuActiveKey: "none",

  searchForKassenzeichenVisible: false,

  waitingVisible: false,
  waitingMessage: null,
  waitingType: WAITING_TYPE_MESSAGE,
  waitingUIAnimation: true,

  d3Available: false,

  searchInProgress: false,
  kassenzeichenToSearchFor: null,
  layers: [
    {
      key: "ABK in Graustufen",
      opacity: 0.5,
      enabled: true,
    },
    {
      key: "ABK in Farbe",
      opacity: 0.5,
      enabled: false,
    },
    {
      key: "Luftbilder (NRW)",
      opacity: 0.5,
      enabled: false,
    },
  ],

  stacInput: "",

  febBlob: null,
  waitForFEB: false,

  cloudStorageStatus: undefined, //CLOUDSTORAGESTATES.CLOUD_STORAGE_UP,
  cloudStorageStatusMessages: [] as string[],
  catchedError: undefined,
  catchedErrorCause: undefined,
  localErrorMessages: [],
  confData: undefined,
  hintVisible: true,
  drawMode: "default" as DrawMode,
  navbarHight: 40,
  isMobileWarningShown: false,
};

const slice = createSlice({
  name: "ui",
  initialState,
  reducers: {
    screenResize(state, action) {
      state.width = action.payload.width;
      state.height = action.payload.height;
    },
    setError(state, action) {
      state.catchedError = action.payload.catchedError;
      state.catchedErrorCause = action.payload.catchedErrorCause;
    },
    toggleInfoElements(state, action) {
      state.infoElementsEnabled = !state.infoElementsEnabled;
    },
    toggleChartElements(state, action) {
      state.chartElementsEnabled = !state.chartElementsEnabled;
    },
    toggleKanalElements(state, action) {
      state.kanalElementsEnabled = !state.kanalElementsEnabled;
    },
    toggleFilterElement(state, action) {
      state.filterElementEnabled = !state.filterElementEnabled;
    },
    toggleDetailElements(state, action) {
      state.detailElementsEnabled = !state.detailElementsEnabled;
    },
    toggleContactElement(state, action) {
      state.contactElementEnabled = !state.contactElementEnabled;
    },
    // showWaiting(state, action) {
    //   if (action.payload.visible && state.waitingVisible) {
    //     state.waitingUIAnimation = false;
    //   } else {
    //     state.waitingUIAnimation = true;
    //   }

    //   state.waitingVisible = action.payload.visible;
    //   state.waitingMessage = action.payload.message;
    //   if (action.payload.waitingType !== null) {
    //     state.waitingType = action.payload.waitingType;
    //   } else {
    //     state.waitingType = WAITING_TYPE_MESSAGE;
    //   }
    // },
    showSettings(state, action) {
      state.settingsVisible = action.payload.visible;
      state.applicationMenuVisible = action.payload.visible;
    },
    showChangeRequestsMenu(state, action) {
      state.changeRequestsMenuVisible = action.payload.visible;
    },
    setCREditMode(state, action) {
      state.changeRequestsEditMode = action.payload;
    },
    showChangeRequestAnnotationEditViewVisible(state, action) {
      state.changeRequestAnnotationEditViewVisible = action.payload;
    },
    setChangeRequestsAnnotationEditViewAnnotationAndCR(state, action) {
      const { annotation, cr } = action.payload;
      state.changeRequestAnnotationEditViewAnnotation = annotation;
      state.changeRequestAnnotationEditViewCR = cr;
    },
    showChangeRequestsEditView(state, action) {
      state.changeRequestEditViewVisible = action.payload;
    },
    setChangeRequestsEditViewFlaecheAndCR(state, action) {
      const { flaeche, cr } = action.payload;
      state.changeRequestEditViewFlaeche = flaeche;
      state.changeRequestEditViewCR = cr;
    },
    showInfo(state, action) {
      state.waitingVisible = true;
      state.waitingMessage = action.payload;
      state.waitingType = WAITING_TYPE_INFO;
    },
    setWaitingType(state, action) {
      state.waitingType = action.payload;
    },
    setErrorMessages(state, action) {
      state.localErrorMessages = action.payload;
    },
    setFebBlob(state, action) {
      if (action.payload.size && action.payload.size > 0) {
        state.febBlob = action.payload;
      }
    },
    setWaitForFEB(state, action) {
      state.waitForFEB = action.payload;
    },
    showWaiting(state, action) {
      state.waitingVisible = action.payload;
    },
    setHintVisible(state, action) {
      state.hintVisible = action.payload;
    },
    setCloudStorageStatus(state, action) {
      const { status, message } = action.payload;
      state.cloudStorageStatus = status;
      if (message !== undefined) {
        state.cloudStorageStatusMessages.push(message);
      }
    },
    setDrawMode(state, action) {
      state.drawMode = action.payload;
    },
    setNavbarHight(state, action) {
      state.navbarHight = action.payload;
    },
    setIsMobileWarningShown(state, action) {
      state.isMobileWarningShown = action.payload;
    },
  },
});

export default slice;

export const {
  screenResize,
  setError,
  showSettings,
  showWaiting,
  toggleChartElements,
  toggleContactElement,
  toggleDetailElements,
  toggleFilterElement,
  toggleInfoElements,
  toggleKanalElements,
  showChangeRequestsMenu,
  setCREditMode,
  showChangeRequestAnnotationEditViewVisible,
  setChangeRequestsAnnotationEditViewAnnotationAndCR,
  showInfo,
  showChangeRequestsEditView,
  setChangeRequestsEditViewFlaecheAndCR,
  setErrorMessages,
  setFebBlob,
  setWaitForFEB,
  setCloudStorageStatus,
  setHintVisible,
  setWaitingType,
  setDrawMode,
  setNavbarHight,
  setIsMobileWarningShown,
} = slice.actions;

export const getConfData = (state) => {
  return state.ui.confData;
};

export const getUiState = (state) => {
  return state.ui;
};

export const getHeight = (state) => {
  return state.ui.height;
};

export const getNavbarHeight = (state) => {
  return state.ui.navbarHight;
};

export const getIsMobileWarningShown = (state) => state.ui.isMobileWarningShown;

export const getDrawMode = (state) => {
  return state.ui.drawMode;
};

export const getChangeRequestEditViewVisible = (state) => {
  return state.ui.changeRequestEditViewVisible;
};

export function addLocalErrorMessage(message) {
  return function (dispatch, getState) {
    const state = getState();
    const errorMessages = JSON.parse(
      JSON.stringify(state.ui.localErrorMessages)
    );
    errorMessages.push(message);
    dispatch(setErrorMessages(errorMessages));
  };
}

export const showInfoWithError = (message) => {
  return function (dispatch) {
    dispatch(showInfo(message));
    dispatch(setWaitingType("WAITING_TYPE_ERROR"));
    dispatch(showWaiting(true));
  };
};
