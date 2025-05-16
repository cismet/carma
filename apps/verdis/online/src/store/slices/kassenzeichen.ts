import { createSlice } from "@reduxjs/toolkit";
import { DOMAIN, SERVICE, STAC_SERVICE } from "../../constants/cids";
import { logout, setLoginInProgress, setStac } from "./auth";
import {
  getAnnotationFeatureCollection,
  getFlaechenFeatureCollection,
} from "../../utils/kassenzeichenMappingTools";
import {
  fitAll,
  setFeatureCollection,
  setSelectedFeatureIndex,
} from "./mapping";
import { toRoman } from "roman-numerals";
import {
  CLOUDSTORAGESTATES,
  setCloudStorageStatus,
  setError,
  showChangeRequestAnnotationEditViewVisible,
  addLocalErrorMessage,
  showWaiting,
  showInfo,
  setFebBlob,
} from "./ui";
import slugify from "slugify";
import type { Feature, Polygon } from "geojson";

export interface GeometryProperties {
  name: string;
  id: string;
  numericId: number;
  draft: boolean;
  type: string;
  bez?: string;
}

export type GeometryFeature = Feature<Polygon, GeometryProperties> & {
  id: string;
};

export interface Aenderungsanfrage {
  kassenzeichen: number;
  flaechen: Record<string, any>;
  nachrichten: any[];
  geometrien: Record<string, GeometryFeature>;
}

export interface Anschlussgrad {
  id: number;
  grad: string;
  grad_abkürzung: string;
}

export interface Beschreibung {
  id: number;
  beschreibung: string;
  dachflaeche: boolean;
}

export interface Flaechenart {
  id: number;
  art: string;
  art_abkürzung: string;
}

export interface FlaechenInfo {
  $self: string;
  anschlussgrad: Anschlussgrad;
  beschreibung: Beschreibung;
  flaechenart: Flaechenart;
}

export interface GeometrieRecord {
  $self: string;
  geo_field: string;
  id: number;
}

export interface Flaeche {
  $self: string;
  anteil: number | null;
  bemerkung: string | null;
  datum_erfassung: string;
  datum_veranlagung: string;
  flaechenbezeichnung: string;
  flaecheninfo: FlaechenInfo;
  geometrie: GeometrieRecord;
  groesse_aus_grafik: number;
  groesse_korrektur: number;
  nachgewiesen: boolean;
  id: number;
}

const initialState = {
  id: -1,
};

const slice = createSlice({
  name: "kassenzeichen",
  initialState,
  reducers: {
    setKassenzeichen(state, action) {
      let test = action.payload.kassenzeichenObject;
      if (test) {
        state = test;
      }
      return state;
    },
  },
});

export default slice;

export const { setKassenzeichen } = slice.actions;

export const getKassenzeichen = (state) => {
  return state.kassenzeichen;
};

export const searchByKassenzeichenId = (kassenzeichenId, fitBounds) => {
  return function (dispatch, getState) {
    // dispatch(d3AvailabilityCheck());
    // dispatch(UiStateActions.setKassenzeichenSearchInProgress(true));
    // dispatch(UiStateActions.showWaiting(true, "Kassenzeichen laden ..."));
    const state = getState();
    let username = state.auth.user;
    let pass = state.auth.password;
    fetch(
      SERVICE +
        "/" +
        DOMAIN +
        ".KASSENZEICHEN/" +
        kassenzeichenId +
        "?role=all&omitNullValues=true&deduplicate=false",
      {
        method: "GET",
        headers: {
          Authorization: "Basic " + btoa(username + "@" + DOMAIN + ":" + pass),
          "Content-Type": "application/json",
        },
      }
    )
      .then(function (response) {
        if (response.status >= 200 && response.status < 300) {
          response.json().then(function (kassenzeichenData) {
            // dispatch(UiStateActions.showWaiting(false));
            dispatch(
              setKassenzeichen({ kassenzeichenObject: kassenzeichenData })
            );
            // dispatch(
            //     RoutingActions.push(
            //         changeKassenzeichenInLocation(
            //             state.routing.location,
            //             kassenzeichenData.kassenzeichennummer8
            //         )
            //     )
            // );
            // switch (state.uiState.mode) {
            //     case APP_MODES.VERSIEGELTE_FLAECHEN: {
            //         createFeatureCollectionForFlaechen({
            //             dispatch,
            //             kassenzeichenData,
            //             changeRequestsEditMode: state.uiState.changeRequestsEditMode
            //         });
            //         break;
            //     }
            //     case APP_MODES.ESW:
            //         dispatch(
            //             MappingActions.setFeatureCollection(
            //                 getFrontenFeatureCollection(kassenzeichenData)
            //             )
            //         );
            //         break;
            //     case APP_MODES.INFO:
            //         dispatch(
            //             MappingActions.setFeatureCollection(
            //                 getKassenzeichenInfoFeatureCollection(kassenzeichenData)
            //             )
            //         );
            //         dispatch(MappingActions.setSelectedFeatureIndex(null));

            //         break;
            //     case APP_MODES.VERSICKERUNG:
            //         dispatch(
            //             MappingActions.setFeatureCollection(
            //                 getFlaechenFeatureCollection(kassenzeichenData)
            //             )
            //         );
            //         dispatch(MappingActions.setSelectedFeatureIndex(null));

            //         break;
            //     default:
            // }

            // dispatch(UiStateActions.setKassenzeichenSearchInProgress(false));
            // if (fitBounds) {
            //     dispatch(MappingActions.fitAll());
            // }
          });
        } else if (response.status === 401) {
          // dispatch(UiStateActions.showWaiting(false));
          // dispatch(AuthActions.invalidateLogin(username, pass, false));
          // dispatch(UiStateActions.setKassenzeichenSearchInProgress(false));
        }
      })
      .catch(function (err) {
        dispatch();
        // UiStateActions.showError(
        //     "Bem Öffnen des Kassenzeichens mit der Id " +
        //         kassenzeichenId +
        //         " ist ein Fehler aufgetreten. (" +
        //         err +
        //         ")"
        // )
        // dispatch(UiStateActions.setKassenzeichenSearchInProgress(false));
      });
  };
};

function storeCR(cr, callback = (payload) => {}) {
  return function (dispatch, getState) {
    dispatch(
      setCloudStorageStatus({ status: CLOUDSTORAGESTATES.CLOUD_STORAGE_UP })
    );
    const stac = getState().auth.stac;
    const kassenzeichen = getState().kassenzeichen;
    function sanitizeChangeRequest(cr: any) {
      const sanitizedGeoms: Record<string, any> = {};
      Object.entries(cr.geometrien || {}).forEach(
        ([name, feature]: [string, any]) => {
          const { selected, inEditMode, ...rest } = feature;
          sanitizedGeoms[name] = rest;
        }
      );
      return {
        ...cr,
        geometrien: sanitizedGeoms,
      };
    }

    const cleanCR = sanitizeChangeRequest(cr);

    let taskParameters = {
      parameters: {
        changerequestJson: cleanCR,
        stac: stac,
        // email: "max.mustermann@cismet.de"
      },
    };

    let fd = new FormData();
    fd.append(
      "taskparams",
      new Blob([JSON.stringify(taskParameters)], {
        type: "application/json",
      })
    );
    // const STAC_SERVICE_ = 'https://eneywvj94f7b6.x.pipedream.net/';
    const url =
      STAC_SERVICE +
      "/actions/" +
      DOMAIN +
      ".kassenzeichenChangeRequest/tasks?role=all&resultingInstanceType=result";

    fetch(url, {
      method: "post",
      body: fd,
    })
      .then(function (response) {
        if (response.status >= 200 && response.status < 300) {
          response.json().then(function (result) {
            const resultObject = JSON.parse(result.res);
            if (resultObject.resultStatus === "SUCCESS") {
              callback(resultObject);
              setTimeout(() => {
                dispatch(setCloudStorageStatus({ status: undefined }));
              }, 100);
              const newKassz = JSON.parse(JSON.stringify(kassenzeichen));
              newKassz.aenderungsanfrage = resultObject.aenderungsanfrage;
              dispatch(setKassenzeichen({ kassenzeichenObject: newKassz }));
            } else {
              dispatch(
                setError(
                  "Fehler beim Speichern der Änderungsanfrage: " +
                    resultObject.errorMessage
                ),
                new Error()
              );
            }
          });
        }
      })
      .catch(function (err) {
        // dispatch(UiStateActions.showError("Bei der Suche nach dem Kassenzeichen " + kassenzeichen + " ist ein Fehler aufgetreten. (" + err + ")"));
        // dispatch(UiStateActions.setKassenzeichenSearchInProgress(false));
        console.log("Error in action" + err);
        // dispatch(AuthActions.logout());
        // if (typeof callback === "function") {
        //     //callback(false);
        // }
      });
  };
}

function createFeatureCollectionForFlaechen({
  dispatch,
  kassenzeichenData,
  selectedIndex = null,
  changeRequestsEditMode = false,
}) {
  const flaechenFC = getFlaechenFeatureCollection(kassenzeichenData);
  //kassenzeichenData
  //state.kassenzeichen
  const annoFC = getAnnotationFeatureCollection(
    kassenzeichenData.aenderungsanfrage
  );
  dispatch(setFeatureCollection([...flaechenFC, ...annoFC]));
  dispatch(setSelectedFeatureIndex(selectedIndex));
}

export const getKassenzeichenbySTAC = (stac, callback) => {
  return function (dispatch, getState) {
    let taskParameters = {
      parameters: {
        STAC: stac,
      },
    };
    let fd = new FormData();
    fd.append(
      "taskparams",
      new Blob([JSON.stringify(taskParameters)], {
        type: "application/json",
      })
    );
    // dispatch(logout());
    dispatch(setLoginInProgress({ loginInProgressTextInfo: "Anmelden ..." }));
    const url =
      STAC_SERVICE +
      "/actions/" +
      DOMAIN +
      ".getMyKassenzeichen/tasks?role=all&resultingInstanceType=result";
    fetch(url, {
      method: "post",
      body: fd,
    })
      .then(function (response) {
        if (response.status >= 200 && response.status < 300) {
          response.json().then(function (actionResult) {
            const kassenzeichenData = JSON.parse(actionResult.res);

            if (kassenzeichenData.nothing) {
              dispatch(logout());
              if (typeof callback === "function") {
                callback(false);
              }
            } else {
              dispatch(
                setKassenzeichen({ kassenzeichenObject: kassenzeichenData })
              );
              const flaechenFC =
                getFlaechenFeatureCollection(kassenzeichenData);
              const annoFC = getAnnotationFeatureCollection(
                kassenzeichenData.aenderungsanfrage
              );

              dispatch(setFeatureCollection([...flaechenFC, ...annoFC]));

              // dispatch(
              //   setFeatureCollection(
              //     getFlaechenFeatureCollection(kassenzeichenData)
              //   )
              // );
              dispatch(setSelectedFeatureIndex(null));
              dispatch(fitAll());
              dispatch(setStac(stac));
              dispatch(
                getFEBByStac(
                  stac,
                  (blob) => {
                    dispatch(setFebBlob(blob));
                  },
                  true
                )
              );

              if (typeof callback === "function") {
                callback(true);
              }
            }
          });
        } else {
          //Errorhandling
          dispatch(logout());
          if (typeof callback === "function") {
            callback(false);
          }
          // dispatch(UiStateActions.showError("Bei der Suche nach dem Kassenzeichen " + kassenzeichen + " ist ein Fehler aufgetreten. ( ErrorCode: " + response.status + ")"));
          // dispatch(UiStateActions.setKassenzeichenSearchInProgress(false));
        }
      })
      .catch(function (err) {
        // dispatch(UiStateActions.showError("Bei der Suche nach dem Kassenzeichen " + kassenzeichen + " ist ein Fehler aufgetreten. (" + err + ")"));
        // dispatch(UiStateActions.setKassenzeichenSearchInProgress(false));
        console.log("Error in action" + err);
        dispatch(logout());
        if (typeof callback === "function") {
          callback(false);
        }
      });
  };
};

export function getNumberOfPendingChanges(cr) {
  let crCounter = 0;
  let crDraftCounter = 0;
  if (cr !== undefined && cr !== null) {
    if (cr.flaechen !== undefined && cr.flaechen != null) {
      const changerequestBezeichnungsArray = Object.keys(cr.flaechen);
      (changerequestBezeichnungsArray || []).forEach(
        (flaechenbezeichnung, index) => {
          const crf = cr.flaechen[flaechenbezeichnung];
          if (crf.draft === true) {
            if (crf.groesse !== undefined) {
              crDraftCounter++;
            }
            if (crf.flaechenart !== undefined) {
              crDraftCounter++;
            }
            if (crf.anschlussgrad !== undefined) {
              crDraftCounter++;
            }
          } else {
            if (crf.groesse !== undefined) {
              crCounter++;
            }
            if (crf.flaechenart !== undefined) {
              crCounter++;
            }
            if (crf.anschlussgrad !== undefined) {
              crCounter++;
            }
          }
        }
      );
    }
    if (cr.nachrichten !== undefined && cr.nachrichten !== null) {
      const changerequestMessagesArray = cr.nachrichten;
      (changerequestMessagesArray || []).forEach((msg) => {
        if (msg.draft === true) {
          if (msg.nachricht !== undefined && msg.nachricht.trim() !== "") {
            crDraftCounter++;
          }
          if (msg.anhang !== undefined && msg.anhang.length > 0) {
            crDraftCounter += msg.anhang.length;
          }
        }
      });
    }

    if (cr.geometrien !== undefined && cr.geometrien !== null) {
      (Object.keys(cr.geometrien) || []).forEach((geomKey) => {
        const geom = cr.geometrien[geomKey];

        if (geom.properties.draft === true) {
          crDraftCounter++;
        }
      });
    }
  }

  return { crDraftCounter, crCounter };
}

export function addAnnotation(annotationFeature) {
  return function (dispatch, getState) {
    const state = getState();
    const kassenzeichen = state.kassenzeichen;
    const newKassz = JSON.parse(JSON.stringify(kassenzeichen));
    const feature = JSON.parse(JSON.stringify(annotationFeature));

    const annotationkeys = Object.keys(
      (newKassz.aenderungsanfrage || {}).geometrien || {}
    );

    let maxId = 0;
    for (const ak of annotationkeys) {
      if (
        Object.keys(newKassz.aenderungsanfrage || ({} as any).geometrien)
          .length > 0
      ) {
        const nid =
          newKassz.aenderungsanfrage.geometrien[ak].properties.numericId;
        if (nid > maxId) {
          maxId = nid;
        }
      }
    }
    feature.id = "anno." + (maxId + 1);

    const annotationName = toRoman(maxId + 1);
    feature.properties.name = annotationName;
    feature.properties.id = feature.id;
    feature.properties.numericId = maxId + 1;

    feature.properties.draft = true;

    if (
      newKassz.aenderungsanfrage === undefined ||
      newKassz.aenderungsanfrage === null
    ) {
      newKassz.aenderungsanfrage = {
        kassenzeichen: newKassz.kassenzeichennummer8,
        flaechen: [],
        nachrichten: [],
        geometrien: {},
      };
    } else {
      if (
        newKassz.aenderungsanfrage.geometrien === undefined ||
        newKassz.aenderungsanfrage.geometrien === null
      ) {
        newKassz.aenderungsanfrage.geometrien = {};
      }
    }
    newKassz.aenderungsanfrage.geometrien[annotationName] = feature;

    dispatch(setKassenzeichen({ kassenzeichenObject: newKassz }));
    createFeatureCollectionForFlaechen({
      dispatch,
      kassenzeichenData: newKassz,
      selectedIndex: getState().mapping.featureCollection.length,
      changeRequestsEditMode: state.ui.changeRequestsEditMode,
    });
    dispatch(storeCR(newKassz.aenderungsanfrage));
  };
}

export function changeAnnotation(annotation) {
  const anno = JSON.parse(JSON.stringify(annotation));
  const selected = anno.selected;
  const inEditMode = anno.inEditMode;
  delete anno.selected;
  delete anno.inEditMode;
  return function (dispatch, getState) {
    const state = getState();
    const kassenzeichen = state.kassenzeichen;
    const newKassz = JSON.parse(JSON.stringify(kassenzeichen));
    if (newKassz.aenderungsanfrage.geometrien !== undefined) {
      newKassz.aenderungsanfrage.geometrien[annotation.properties.name] = anno;
    }

    dispatch(storeCR(newKassz.aenderungsanfrage));

    newKassz.aenderungsanfrage.geometrien[annotation.properties.name].selected =
      selected;
    newKassz.aenderungsanfrage.geometrien[
      annotation.properties.name
    ].inEditMode = inEditMode;
    dispatch(setKassenzeichen({ kassenzeichenObject: newKassz }));
    createFeatureCollectionForFlaechen({
      dispatch,
      kassenzeichenData: newKassz,
      selectedIndex: getState().mapping.selectedIndex,
      changeRequestsEditMode: state.ui.changeRequestsEditMod,
    });
  };
}

export function removeAnnotation(annotation) {
  return function (dispatch, getState) {
    const state = getState();
    const kassenzeichen = state.kassenzeichen;

    const newKassz = JSON.parse(JSON.stringify(kassenzeichen));
    if (newKassz.aenderungsanfrage.geometrien !== undefined) {
      delete newKassz.aenderungsanfrage.geometrien[annotation.properties.name];
    }
    dispatch(storeCR(newKassz.aenderungsanfrage));
    dispatch(setKassenzeichen({ kassenzeichenObject: newKassz }));
    createFeatureCollectionForFlaechen({
      dispatch,
      kassenzeichenData: newKassz,
      changeRequestsEditMode: state.ui.changeRequestsEditMode,
    });
    dispatch(showChangeRequestAnnotationEditViewVisible(false));
  };
}

export function addChangeRequestMessage(msg) {
  return function (dispatch, getState) {
    const kassenzeichen = getState().kassenzeichen;
    const newKassz = JSON.parse(JSON.stringify(kassenzeichen));

    if (
      newKassz.aenderungsanfrage === undefined ||
      newKassz.aenderungsanfrage === null
    ) {
      newKassz.aenderungsanfrage = {
        kassenzeichen: newKassz.kassenzeichennummer8,
        flaechen: [],
        nachrichten: [msg],
        geometrien: {},
      };
    } else {
      if (
        newKassz.aenderungsanfrage.nachrichten === undefined ||
        newKassz.aenderungsanfrage.nachrichten === null
      ) {
        newKassz.aenderungsanfrage.nachrichten = [];
      }
      const sMsgs = newKassz.aenderungsanfrage.nachrichten.sort(
        (a, b) => a.timestamp - b.timestamp
      );
      if (
        sMsgs.length !== 0 &&
        sMsgs[sMsgs.length - 1].typ === "CITIZEN" &&
        sMsgs[sMsgs.length - 1].draft === true
      ) {
        //last Message is from citizen, so add stuff to it

        //1. Messagetext
        if (msg.nachricht !== undefined && msg.nachricht !== "") {
          if (
            sMsgs[sMsgs.length - 1].nachricht !== undefined &&
            sMsgs[sMsgs.length - 1].nachricht.trim() !== ""
          ) {
            sMsgs[sMsgs.length - 1].nachricht =
              sMsgs[sMsgs.length - 1].nachricht + "\n" + msg.nachricht;
          } else {
            sMsgs[sMsgs.length - 1].nachricht = msg.nachricht;
          }
        }

        //2. Messageatachments
        if (msg.anhang !== undefined) {
          if (sMsgs[sMsgs.length - 1].anhang !== undefined) {
            msg.anhang.forEach((doc) =>
              sMsgs[sMsgs.length - 1].anhang.push(doc)
            );
          } else {
            sMsgs[sMsgs.length - 1].anhang = msg.anhang;
          }
        }
      } else if (
        (msg.anhang !== undefined && msg.anhang.length > 0) ||
        (msg.nachricht !== undefined && msg.nachricht.trim() !== "")
      ) {
        newKassz.aenderungsanfrage.nachrichten.push(msg);
      }
    }
    dispatch(setKassenzeichen({ kassenzeichenObject: newKassz }));
    dispatch(storeCR(newKassz.aenderungsanfrage));
  };
}

export function setChangeRequestsForFlaeche(flaeche, crs) {
  return function (dispatch, getState) {
    const kassenzeichen = getState().kassenzeichen;
    const newKassz = JSON.parse(JSON.stringify(kassenzeichen));
    if (
      newKassz.aenderungsanfrage === undefined ||
      newKassz.aenderungsanfrage === null
    ) {
      newKassz.aenderungsanfrage = {
        kassenzeichen: newKassz.kassenzeichennummer8,
        flaechen: {},
        nachrichten: [],
        annotations: [],
      };
    } else if (newKassz.aenderungsanfrage.flaechen === undefined) {
      newKassz.aenderungsanfrage.flaechen = {};
    }
    newKassz.aenderungsanfrage.flaechen[flaeche.flaechenbezeichnung] = crs;
    dispatch(setKassenzeichen({ kassenzeichenObject: newKassz }));
    dispatch(storeCR(newKassz.aenderungsanfrage));
  };
}

export function addCRDoc(file, callback) {
  return function (dispatch, getState) {
    const stac = getState().auth.stac;
    let taskParameters = {
      parameters: {
        fileName: slugify(file.name),
        stac,
      },
    };

    let fd = new FormData();
    fd.append("file", new Blob([file]));

    fd.append(
      "taskparams",
      new Blob([JSON.stringify(taskParameters)], {
        type: "application/json",
      })
    );

    const url =
      STAC_SERVICE +
      "/actions/" +
      DOMAIN +
      ".uploadChangeRequestAnhang/tasks?role=all&resultingInstanceType=result";

    fetch(url, {
      method: "post",
      body: fd,
    })
      .then(function (response) {
        if (response.status >= 200 && response.status < 300) {
          response.json().then(function (result) {
            callback(result.res);
          });
        } else {
          dispatch(
            addLocalErrorMessage({
              typ: "LOCALERROR",
              nachricht:
                "Der Server hat einen unerwarteten Status Code beim Hochladen der Datei geliefert (" +
                response.status +
                "). Bitte versuchen Sie es später noch einmal. Sollte der Fehler weiter bestehen bleiben, bitten wir Sie Ihren Ansprechpartner in der Stadtverwaltung per Mail zu kontaktieren.",
              draft: true,
            })
          );
          callback();
        }
      })
      .catch(function (err) {
        dispatch(
          addLocalErrorMessage({
            typ: "LOCALERROR",
            nachricht:
              "Der Server hat einen unerwarteten Fehler beim Hochladen der Datei geliefert (" +
              err +
              "). Bitte versuchen Sie es später noch einmal. Sollte der Fehler weiter bestehen bleiben, bitten wir Sie Ihren Ansprechpartner in der Stadtverwaltung per Mail zu kontaktieren.",
            draft: true,
          })
        );
        callback();
      });
  };
}

export function removeLastChangeRequestMessage() {
  return function (dispatch, getState) {
    const kassenzeichen = getState().kassenzeichen;
    const newKassz = JSON.parse(JSON.stringify(kassenzeichen));
    const sMsgs = newKassz.aenderungsanfrage.nachrichten.sort(
      (a, b) => a.timestamp - b.timestamp
    );
    const lastMsg = sMsgs[sMsgs.length - 1];
    if (lastMsg.typ === "CITIZEN" && lastMsg.draft === true) {
      sMsgs.length = sMsgs.length - 1;
      newKassz.aenderungsanfrage.nachrichten = sMsgs;
    }

    dispatch(storeCR(newKassz.aenderungsanfrage));
    dispatch(setKassenzeichen({ kassenzeichenObject: newKassz }));
  };
}

export function getFEBByStac(stac, callback, silent = false) {
  return function (dispatch, getState) {
    if (silent === false) {
      dispatch(showInfo("FEB wird erzeugt"));
    }
    let taskParameters = {
      parameters: {
        STAC: stac,
      },
    };

    let fd = new FormData();
    fd.append(
      "taskparams",
      new Blob([JSON.stringify(taskParameters)], {
        type: "application/json",
      })
    );

    const url =
      STAC_SERVICE +
      "/actions/" +
      DOMAIN +
      ".getMyFEB/tasks?role=all&resultingInstanceType=result";
    fetch(url, {
      method: "post",
      body: fd,
    })
      .then((response) => {
        if (response.status >= 200 && response.status < 300) {
          return response.json();
        } else {
          console.log(
            "Error:" + response.status + " -> " + response.statusText
          );
        }
      })
      .catch((e) => {
        console.log(e);
      })
      .then((result) => {
        if (result && !result.error && result.res !== '{"nothing":"at all"}') {
          let byteCharacters = atob(result.res);
          let byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }

          let byteArray = new Uint8Array(byteNumbers);

          var blob = new Blob([byteArray], { type: "application/pdf" });
          callback(blob);
          if (silent === false) {
            dispatch(showWaiting(false));
          }
        } else {
          if (silent === false) {
            dispatch(showWaiting(false));
          }
          console.log(result);
        }
      });
  };
}

export function requestEmailChange(email) {
  return function (dispatch, getState) {
    const kassenzeichen = getState().kassenzeichen;
    const newKassz = JSON.parse(JSON.stringify(kassenzeichen));

    if (
      newKassz.aenderungsanfrage === undefined ||
      newKassz.aenderungsanfrage === null
    ) {
      newKassz.aenderungsanfrage = {
        kassenzeichen: newKassz.kassenzeichennummer8,
        emailAdresse: email,
        flaechen: [],
        nachrichten: [],
        geometrien: {},
      };
    } else {
      newKassz.aenderungsanfrage.emailAdresse = email;
      newKassz.aenderungsanfrage.emailVerifiziert = null;
    }
    dispatch(setKassenzeichen({ kassenzeichenObject: newKassz }));
    dispatch(storeCR(newKassz.aenderungsanfrage));
  };
}

export function completeEmailChange(code, callback = (payload) => {}) {
  return function (dispatch, getState) {
    const kassenzeichen = getState().kassenzeichen;
    const newKassz = JSON.parse(JSON.stringify(kassenzeichen));
    if (
      newKassz.aenderungsanfrage === undefined ||
      newKassz.aenderungsanfrage === null
    ) {
      // kann/darf nie passieren. Woher soll die email kommen, wenn nicht aus einer vorherigen Änderungsanfrage ?!
    } else {
      newKassz.aenderungsanfrage.emailVerifikation = code;
    }
    dispatch(setKassenzeichen({ kassenzeichenObject: newKassz }));
    dispatch(storeCR(newKassz.aenderungsanfrage, callback));
  };
}

export function submitCR() {
  return function (dispatch, getState) {
    dispatch(
      setCloudStorageStatus({ status: CLOUDSTORAGESTATES.CLOUD_STORAGE_UP })
    );
    const kassenzeichen = getState().kassenzeichen;
    const newKassz = JSON.parse(JSON.stringify(kassenzeichen));

    if (
      newKassz.aenderungsanfrage !== undefined &&
      newKassz.aenderungsanfrage !== null
    ) {
      if (newKassz.aenderungsanfrage.nachrichten === undefined) {
        newKassz.aenderungsanfrage.nachrichten = [];
      }
      if (newKassz.aenderungsanfrage.flaechen !== undefined) {
        const changerequestBezeichnungsArray = Object.keys(
          newKassz.aenderungsanfrage.flaechen
        );
        (changerequestBezeichnungsArray || []).forEach(
          (flaechenbezeichnung, index) => {
            newKassz.aenderungsanfrage.flaechen[flaechenbezeichnung].draft =
              false;
          }
        );
      }
      const changerequestMessagesArray = newKassz.aenderungsanfrage.nachrichten;
      (changerequestMessagesArray || []).forEach((msg) => {
        if (msg.draft === true) {
          msg.draft = false;
        }
      });

      if (newKassz.aenderungsanfrage.geometrien === undefined) {
        newKassz.aenderungsanfrage.geometrien = {};
      }
      for (const ak of Object.keys(newKassz.aenderungsanfrage.geometrien)) {
        newKassz.aenderungsanfrage.geometrien[ak].properties.draft = false;
      }

      dispatch(setKassenzeichen({ kassenzeichenObject: newKassz }));
      dispatch(storeCR({ ...newKassz.aenderungsanfrage, submission: true }));
    }
  };
}
