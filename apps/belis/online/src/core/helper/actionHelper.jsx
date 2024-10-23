import AddImageDialog from "../../components/app/dialogs/AddImage";
import AddIncidentDialog, {
  ADD_INCIDENT_MODES,
} from "../../components/app/dialogs/AddIncident";
import ProtokollAction from "../../components/app/dialogs/ProtokollAction";
import SetStatusDialog from "../../components/app/dialogs/SetStatus";
import addIncidentAction from "../store/slices/actionSubslices/addIncidentAction";
import protocolAction from "../store/slices/actionSubslices/protocolAction";
import { showDialog } from "../store/slices/app";
import {
  MODES as FEATURECOLLECTION_MODES,
  setSecondaryInfoVisible,
} from "../store/slices/featureCollection";
import { addImageToObjectAction } from "../store/slices/offlineActionDb";
import { addIncidentActionIcons, protocolActionInfos } from "./actionInfos";
import { getVCard } from "./featureHelper";
import { zoomToFeature } from "./mapHelper";

export const getObjectActionInfos = ({
  selectedFeature,
  selectedArbeitsauftrag,
  refRoutedMap,
  mode,
  dispatch,
}) => {
  const vcard = getVCard(selectedFeature);
  const actionLinkInfos = [
    {
      tooltip: "Auf Objekt zoomen",
      onClick: () => {
        zoomToFeature({
          feature: selectedFeature,
          mapRef: refRoutedMap.current.leafletMap.leafletElement,
        });
      },
      iconname: "search-location",
    },
  ];

  if (mode === FEATURECOLLECTION_MODES.OBJECTS) {
    if (
      selectedFeature?.featuretype !== "Leitung" &&
      selectedFeature?.featuretype !== "abzweigdose"
    ) {
      actionLinkInfos.push({
        tooltip: "Öffne Datenblatt",
        onClick: () => {
          dispatch(setSecondaryInfoVisible(true));
        },
        iconname: "info",
      });
    }
    actionLinkInfos.push({
      tooltip: "Foto hinzufügen",
      onClick: () => {
        const dialog = (
          <AddImageDialog
            close={() => {
              dispatch(showDialog());
            }}
            input={{ feature: selectedFeature, vcard }}
            onClose={(addImageParamater) => {
              dispatch(addImageToObjectAction(addImageParamater));
            }}
          />
        );
        dispatch(showDialog(dialog));
      },
      iconname: "camera",
    });
    let subs = getSubActionInfoForAddIncident({
      selectedFeature,
      selectedArbeitsauftrag,
      dispatch,
    });
    actionLinkInfos.push({
      tooltip: "Störung melden",
      subs,
      iconname: "exclamation-triangle",
    });
  } else if (mode === FEATURECOLLECTION_MODES.TASKLISTS) {
    actionLinkInfos.push({
      tooltip: "Öffne Datenblatt",
      onClick: () => {
        dispatch(setSecondaryInfoVisible(true));
      },
      iconname: "info",
    });
  } else {
    //Protocols
    actionLinkInfos.push({
      tooltip: "Öffne Datenblatt",
      onClick: () => {
        dispatch(setSecondaryInfoVisible(true));
      },
      iconname: "info",
    });
    if (selectedFeature.properties.intermediate !== true) {
      actionLinkInfos.push({
        tooltip: "Status ändern",
        onClick: () => {
          const dialog = (
            <SetStatusDialog
              close={() => {
                dispatch(showDialog());
              }}
              input={{ feature: selectedFeature, vcard }}
              onClose={(params) => {
                dispatch(protocolAction(params, selectedFeature.properties));
              }}
            />
          );

          dispatch(showDialog(dialog));
        },
        iconname: "tasks",
      });
      const actionSubs = getSubActionInfoForProtocolAction({
        selectedFeature,
        dispatch,
      });
      if (actionSubs?.length === 1) {
        actionLinkInfos.push({
          tooltip: actionSubs[0].tooltip || actionSubs[0].title,
          iconspan: actionSubs[0].iconspan,
          onClick: actionSubs[0].onClick,
        });
      } else {
        actionLinkInfos.push({
          tooltip: "Aktionen",
          iconname: "list-alt",
          subs: actionSubs,
        });
      }
    }
  }

  return actionLinkInfos;
};

const getSubActionInfoForAddIncident = ({
  selectedFeature,
  selectedArbeitsauftrag,
  dispatch,
}) => {
  const vcard = getVCard(selectedFeature);
  let subs = [];
  //check if selected feature is a tdta_leuchte

  if (selectedFeature.featuretype === "tdta_leuchten") {
    if (selectedFeature.properties.fk_standort) {
      const pseudoStandortFeature = {
        featuretype: "tdta_standort_mast",
        properties: selectedFeature.properties.fk_standort,
      };

      subs.push({
        tooltip: "Mast: Nur Veranlassung",
        title: "Mast: Nur Veranlassung",
        iconspan: addIncidentActionIcons.veranlassung_mast,
        onClick: () => {
          const dialog = (
            <AddIncidentDialog
              close={() => {
                dispatch(showDialog());
              }}
              input={{
                feature: pseudoStandortFeature,
                vcard: getVCard(pseudoStandortFeature),
                mode: ADD_INCIDENT_MODES.VERANLASSUNG,
              }}
              onClose={(params) => {
                dispatch(addIncidentAction(params));
              }}
            />
          );

          dispatch(showDialog(dialog));
        },
      });
      subs.push({
        tooltip: "Mast: Einzelauftrag",
        title: "Mast: Einzelauftrag",
        iconspan: addIncidentActionIcons.einzelauftrag_mast,
        onClick: () => {
          const dialog = (
            <AddIncidentDialog
              close={() => {
                dispatch(showDialog());
              }}
              input={{
                feature: pseudoStandortFeature,
                vcard: getVCard(pseudoStandortFeature),
                mode: ADD_INCIDENT_MODES.EINZELAUFTRAG,
              }}
              onClose={(params) => {
                dispatch(addIncidentAction(params));
              }}
            />
          );

          dispatch(showDialog(dialog));
        },
      });

      if (
        selectedArbeitsauftrag &&
        selectedArbeitsauftrag.properties.intermediate !== true
      ) {
        subs.push({
          tooltip: "Mast: Arbeitsauftrag ergänzen",
          title:
            "Mast: " + selectedArbeitsauftrag.properties.nummer + " ergänzen",
          // iconname: "exclamation-triangle",
          iconspan: addIncidentActionIcons.add2arbeitsauftrag_mast,
          onClick: () => {
            const dialog = (
              <AddIncidentDialog
                close={() => {
                  dispatch(showDialog());
                }}
                input={{
                  feature: pseudoStandortFeature,
                  vcard: getVCard(pseudoStandortFeature),
                  mode: ADD_INCIDENT_MODES.ADD2ARBEITSAUFTRAG,
                  arbeitsauftrag: selectedArbeitsauftrag,
                }}
                onClose={(params) => {
                  dispatch(addIncidentAction(params));
                }}
              />
            );
            dispatch(showDialog(dialog));
          },
        });
      }
    }
    subs.push({
      tooltip: "Leuchte: Nur Veranlassung",
      title: "Leuchte: Nur Veranlassung",
      iconspan: addIncidentActionIcons.veranlassung_leuchte,
      onClick: () => {
        const dialog = (
          <AddIncidentDialog
            close={() => {
              dispatch(showDialog());
            }}
            input={{
              feature: selectedFeature,
              vcard,
              mode: ADD_INCIDENT_MODES.VERANLASSUNG,
            }}
            onClose={(params) => {
              dispatch(addIncidentAction(params));
            }}
          />
        );

        dispatch(showDialog(dialog));
      },
    });
    subs.push({
      tooltip: "Leuchte: Einzelauftrag",
      title: "Leuchte: Einzelauftrag",
      iconspan: addIncidentActionIcons.einzelauftrag_leuchte,
      onClick: () => {
        const dialog = (
          <AddIncidentDialog
            close={() => {
              dispatch(showDialog());
            }}
            input={{
              feature: selectedFeature,
              vcard,
              mode: ADD_INCIDENT_MODES.EINZELAUFTRAG,
            }}
            onClose={(params) => {
              dispatch(addIncidentAction(params));
            }}
          />
        );

        dispatch(showDialog(dialog));
      },
    });

    if (
      selectedArbeitsauftrag &&
      selectedArbeitsauftrag.properties.intermediate !== true
    ) {
      subs.push({
        tooltip: "Leuchte: Arbeitsauftrag ergänzen",
        title:
          "Leuchte: " + selectedArbeitsauftrag.properties.nummer + " ergänzen",
        // iconname: "exclamation-triangle",
        iconspan: addIncidentActionIcons.add2arbeitsauftrag_leuchte,
        onClick: () => {
          const dialog = (
            <AddIncidentDialog
              close={() => {
                dispatch(showDialog());
              }}
              input={{
                feature: selectedFeature,
                vcard,
                mode: ADD_INCIDENT_MODES.ADD2ARBEITSAUFTRAG,
                arbeitsauftrag: selectedArbeitsauftrag,
              }}
              onClose={(params) => {
                dispatch(addIncidentAction(params));
              }}
            />
          );
          dispatch(showDialog(dialog));
        },
      });
    }
  } else if (selectedFeature.featuretype === "tdta_standort_mast") {
    subs = [
      {
        tooltip: "Nur Veranlassung",
        title: "Nur Veranlassung",
        iconspan: addIncidentActionIcons.veranlassung_mast,
        onClick: () => {
          const dialog = (
            <AddIncidentDialog
              close={() => {
                dispatch(showDialog());
              }}
              input={{
                feature: selectedFeature,
                vcard,
                mode: ADD_INCIDENT_MODES.VERANLASSUNG,
              }}
              onClose={(params) => {
                dispatch(addIncidentAction(params));
              }}
            />
          );

          dispatch(showDialog(dialog));
        },
      },
      {
        tooltip: "Einzelauftrag",
        title: "Einzelauftrag",
        iconspan: addIncidentActionIcons.einzelauftrag_mast,
        onClick: () => {
          const dialog = (
            <AddIncidentDialog
              close={() => {
                dispatch(showDialog());
              }}
              input={{
                feature: selectedFeature,
                vcard,
                mode: ADD_INCIDENT_MODES.EINZELAUFTRAG,
              }}
              onClose={(params) => {
                dispatch(addIncidentAction(params));
              }}
            />
          );

          dispatch(showDialog(dialog));
        },
      },
    ];

    if (
      selectedArbeitsauftrag &&
      selectedArbeitsauftrag.properties.intermediate !== true
    ) {
      subs.push({
        tooltip: "Arbeitsauftrag ergänzen",
        title: selectedArbeitsauftrag.properties.nummer + " ergänzen",
        // iconname: "exclamation-triangle",
        iconspan: addIncidentActionIcons.add2arbeitsauftrag_mast,
        onClick: () => {
          const dialog = (
            <AddIncidentDialog
              close={() => {
                dispatch(showDialog());
              }}
              input={{
                feature: selectedFeature,
                vcard,
                mode: ADD_INCIDENT_MODES.ADD2ARBEITSAUFTRAG,
                arbeitsauftrag: selectedArbeitsauftrag,
              }}
              onClose={(params) => {
                dispatch(addIncidentAction(params));
              }}
            />
          );
          dispatch(showDialog(dialog));
        },
      });
    }
  } else {
    subs = [
      {
        tooltip: "Nur Veranlassung",
        title: "Nur Veranlassung",
        iconspan: addIncidentActionIcons.veranlassung,
        onClick: () => {
          const dialog = (
            <AddIncidentDialog
              close={() => {
                dispatch(showDialog());
              }}
              input={{
                feature: selectedFeature,
                vcard,
                mode: ADD_INCIDENT_MODES.VERANLASSUNG,
              }}
              onClose={(params) => {
                dispatch(addIncidentAction(params));
              }}
            />
          );

          dispatch(showDialog(dialog));
        },
      },
      {
        tooltip: "Einzelauftrag",
        title: "Einzelauftrag",
        iconspan: addIncidentActionIcons.einzelauftrag,
        onClick: () => {
          const dialog = (
            <AddIncidentDialog
              close={() => {
                dispatch(showDialog());
              }}
              input={{
                feature: selectedFeature,
                vcard,
                mode: ADD_INCIDENT_MODES.EINZELAUFTRAG,
              }}
              onClose={(params) => {
                dispatch(addIncidentAction(params));
              }}
            />
          );

          dispatch(showDialog(dialog));
        },
      },
    ];

    if (
      selectedArbeitsauftrag &&
      selectedArbeitsauftrag.properties.intermediate !== true
    ) {
      subs.push({
        tooltip: "Arbeitsauftrag ergänzen",
        title: selectedArbeitsauftrag.properties.nummer + " ergänzen",
        // iconname: "exclamation-triangle",
        iconspan: addIncidentActionIcons.add2arbeitsauftrag,
        onClick: () => {
          const dialog = (
            <AddIncidentDialog
              close={() => {
                dispatch(showDialog());
              }}
              input={{
                feature: selectedFeature,
                vcard,
                mode: ADD_INCIDENT_MODES.ADD2ARBEITSAUFTRAG,
                arbeitsauftrag: selectedArbeitsauftrag,
              }}
              onClose={(params) => {
                dispatch(addIncidentAction(params));
              }}
            />
          );
          dispatch(showDialog(dialog));
        },
      });
    }
  }
  return subs;
};

const getSubInfoForKey = (key, dispatch, selectedFeature) => {
  const vcard = getVCard(selectedFeature);
  const info = protocolActionInfos[key];
  return {
    title: info.title,
    iconspan: info.icon,
    onClick: () => {
      const dialog = (
        <ProtokollAction
          close={() => {
            dispatch(showDialog());
          }}
          input={{ feature: selectedFeature, vcard }}
          actionname={info.actionname}
          actionkey={key}
          onClose={(params) => {
            dispatch(protocolAction(params, selectedFeature.properties));
          }}
          title={info.title}
        />
      );

      dispatch(showDialog(dialog));
    },
  };
};
const getSubActionInfoForProtocolAction = ({ selectedFeature, dispatch }) => {
  const type = selectedFeature.fachobjekttype;
  const subs = [];
  switch (type) {
    case "geom":
      break;
    case "tdta_leuchten":
      subs.push(
        getSubInfoForKey("leuchtenerneuerung", dispatch, selectedFeature)
      );
      subs.push(
        getSubInfoForKey("leuchtmittelwechselEP", dispatch, selectedFeature)
      );
      subs.push(
        getSubInfoForKey("leuchtmittelwechsel", dispatch, selectedFeature)
      );
      subs.push(
        getSubInfoForKey(
          "rundsteuerempfaengerwechsel",
          dispatch,
          selectedFeature
        )
      );
      subs.push(getSubInfoForKey("sonderturnus", dispatch, selectedFeature));
      subs.push(
        getSubInfoForKey("vorschaltgeraetewechsel", dispatch, selectedFeature)
      );
      break;
    case "tdta_standort_mast":
      subs.push(
        getSubInfoForKey("anstricharbeiten", dispatch, selectedFeature)
      );
      subs.push(getSubInfoForKey("ep", dispatch, selectedFeature));
      subs.push(getSubInfoForKey("masterneuerung", dispatch, selectedFeature));
      subs.push(
        getSubInfoForKey("standortrevision", dispatch, selectedFeature)
      );
      subs.push(
        getSubInfoForKey("standsicherheitspruefung", dispatch, selectedFeature)
      );
      break;
    case "leitung":
      break;
    case "schaltstelle":
      subs.push(
        getSubInfoForKey("schaltstellerevision", dispatch, selectedFeature)
      );
      break;
    case "abzweigdose":
      break;
    case "mauerlasche":
      subs.push(getSubInfoForKey("pruefung", dispatch, selectedFeature));
      break;
    default:
      console.log("unknown featuretype. this should not happen", type);
  }

  //Sonstiges für alle
  subs.push(getSubInfoForKey("sonstiges", dispatch, selectedFeature));

  return subs;
};
