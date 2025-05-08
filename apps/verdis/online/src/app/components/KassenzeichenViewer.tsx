// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { Alert } from "react-bootstrap";
import Navbar from "./Navbar";
import Waiting from "./Waiting";
import Map from "./Map";
import ContactPanel from "./ContactPanel";
import { useDispatch, useSelector } from "react-redux";
import {
  addChangeRequestMessage,
  addCRDoc,
  changeAnnotation,
  getKassenzeichen,
  getKassenzeichenbySTAC,
  getNumberOfPendingChanges,
  removeAnnotation,
  setChangeRequestsForFlaeche,
} from "../../store/slices/kassenzeichen";
import KassenzeichenPanel from "./KassenzeichenPanel";
import KassenzeichenFlaechenChartPanel from "./KassenzeichenFlaechenChartPanel";
import {
  getCRsForFlaeche,
  getOverlayTextForFlaeche,
  hasAttachment,
  kassenzeichenFlaechenSorter,
  needsProof,
  needsProofSingleFlaeche,
} from "../../utils/kassenzeichenHelper";
import FlaechenPanel from "./FlaechenPanel";
import {
  addLocalErrorMessage,
  getHeight,
  getUiState,
  setChangeRequestsAnnotationEditViewAnnotationAndCR,
  setChangeRequestsEditViewFlaecheAndCR,
  showChangeRequestAnnotationEditViewVisible,
  showChangeRequests,
  showChangeRequestsEditView,
  showInfo,
  showWaiting,
  toggleInfoElements,
} from "../../store/slices/ui";
import { fitAll, getMapping } from "../../store/slices/mapping";
import HelpAndSettings from "../components/helpandsettings/Menu00MainComponent";
import ChangeRequests from "../components/changerequests/CR00MainComponent";
import {
  getStac,
  getSuccesfullLogin,
  setLoginInProgress,
} from "../../store/slices/auth";
import { useNavigate } from "react-router-dom";
import { KassenzeichenViewerGefahrensignal } from "@carma-collab/wuppertal/verdis-online";
import AnnotationPanel from "./AnnotationPanel";
import ChangeRequestEditView from "../components/changerequests/CR50Flaechendialog";
import AnnotationEditView from "../components/changerequests/CR60AnnotationDialog";
import CONTACTS_MAP, { defaultContact } from "../../constants/contacts";
import { useEffect } from "react";

const KassenzeichenViewer = () => {
  const kassenzeichen = useSelector(getKassenzeichen);
  const height = useSelector(getHeight);
  const uiState = useSelector(getUiState);
  const mapping = useSelector(getMapping);
  const stac = useSelector(getStac);
  const login = useSelector(getSuccesfullLogin);
  const navigate = useNavigate();
  const dispatch = useDispatch();

  useEffect(() => {
    if (!stac) {
      navigate("/");
    } else {
      if (!login) {
        // console.log("xxx not successefull login");
        // dispatch(setLoginInProgress({}));
        dispatch(showInfo("Kassenzeichen wird wieder geladen"));
        dispatch(showWaiting(true));
        dispatch(
          getKassenzeichenbySTAC(stac, (success) => {
            if (success === true) {
              setTimeout(() => {
                dispatch(showWaiting(false));
                dispatch(fitAll());
              }, 300);
            }
          })
        );
      }

      // console.log("xxx successefull login");
    }
  }, []);

  // let flaechenPanelRefs = useRef({});

  const verticalPanelWidth = 280;

  const isFlaecheSelected = (flaeche) => {
    return (
      mapping.featureCollection !== "undefined" &&
      mapping.featureCollection.length > 0 &&
      mapping.selectedIndex !== "undefined" &&
      mapping.featureCollection.length > mapping.selectedIndex &&
      mapping.featureCollection[mapping.selectedIndex] &&
      mapping.featureCollection[mapping.selectedIndex]?.properties.id ===
        flaeche.id
    );
  };

  let selectedFlaeche = null;
  if (mapping.selectedIndex !== undefined && mapping.selectedIndex !== -1) {
    selectedFlaeche = mapping.featureCollection[mapping.selectedIndex];
  }

  const horizontalPanelHeight = 150;
  const horizontalPanelWidth = 200;

  const switchToBottomWhenSmallerThan = 900;
  const detailsStyle = {
    backgroundColor: "#EEE",
    padding: "5px 5px 5px 5px",
    overflow: "auto",
  };

  let { crDraftCounter } = getNumberOfPendingChanges(
    kassenzeichen.aenderungsanfrage
  );
  let draftAlert;
  if (crDraftCounter > 0) {
    draftAlert = (
      <div
        style={{
          position: "absolute",
          top: 60,
          right: 285,
          zIndex: 500,
          width: 500,
          opacity: 0.9,
        }}
      >
        <Alert
          variant="danger"
          dismissible
          onClose={() => {
            dispatch(showChangeRequests({ visible: true }));
          }}
        >
          <div>
            <b>Sie haben momentan nicht eingereichte Änderungen.</b> Bitte
            beachten Sie, dass Änderungswünsche, Anmerkungen und Ihre
            hochgeladenen Dokumente erst für den Sachbearbeiter sichtbar werden,
            wenn sie die Änderungen freigegeben/entsperrt und eingereicht haben.
          </div>
        </Alert>
      </div>
    );
  }

  const changerequests = kassenzeichen.aenderungsanfrage;
  const changerequestBezeichnungsArray =
    Object.keys((changerequests || { flaechen: [] }).flaechen || []) || [];

  const changerequestMessagesArray =
    (changerequests || { nachrichten: [] }).nachrichten || [];
  const sMsgs = changerequestMessagesArray;
  const documents: any = [];

  sMsgs.forEach((msg) => {
    //if a document exists, add it to the documents array
    if (msg.anhang !== undefined && msg.anhang.length > 0) {
      msg.anhang.forEach((anhang) => {
        documents.push(anhang);
      });
    }
  });

  let proofAlert;

  let flaechenInfoOverlay;
  let verdisMapWithAdditionalComponents;
  let mapHeight = height - 50;
  let flaechen = [];
  let anmerkungsflaechen = [];

  if (kassenzeichen.flaechen) {
    flaechen = kassenzeichen.flaechen
      .concat()
      .sort(kassenzeichenFlaechenSorter);
  }

  if (
    kassenzeichen.aenderungsanfrage !== undefined &&
    kassenzeichen.aenderungsanfrage !== null &&
    kassenzeichen.aenderungsanfrage.geometrien !== undefined
  ) {
    const keys = Object.keys(kassenzeichen.aenderungsanfrage.geometrien);
    for (const key of keys) {
      anmerkungsflaechen.push(kassenzeichen.aenderungsanfrage.geometrien[key]);
    }
  }

  let contactPanel = <div />;
  let kassenzeichenPanel = <div />;
  let kassenzeichenHorizontalFlaechenChartsPanel;
  let kassenzeichenVerticalFlaechenChartsPanel;
  let anComps = [];
  let flComps = [];

  flComps = flaechen.map(function (flaeche) {
    const sel = isFlaecheSelected(flaeche);
    const flaechenCR = getCRsForFlaeche(kassenzeichen, flaeche);
    const hasAttachments = hasAttachment(kassenzeichen.aenderungsanfrage);
    return (
      <FlaechenPanel
        // ref={(c) => {
        //   flaechenPanelRefs.current[flaeche.id] = c;
        // }}
        key={flaeche.id + "." + sel}
        selected={sel}
        // flaechenPanelClickHandler={that.flaechenPanelClick}
        flaeche={flaeche}
        flaechenCR={flaechenCR ? flaechenCR : {}}
        editMode={uiState.changeRequestsEditMode}
        proofNeeded={needsProofSingleFlaeche(flaechenCR) && !hasAttachments}
        display={uiState.changeRequestsEditMode === true ? "cr" : "original"}
        showEditCRMenu={() => {
          dispatch(
            setChangeRequestsEditViewFlaecheAndCR({
              flaeche: flaeche,
              cr: flaechenCR,
            })
          );
          dispatch(showChangeRequestsEditView(true));
        }}
      />
    );
  });

  if (anmerkungsflaechen && uiState.changeRequestsEditMode === true) {
    const sortedAnmerkungsflaechen = anmerkungsflaechen.sort((a, b) => {
      return (
        Number(a.id.replace("anno.", "")) - Number(b.id.replace("anno.", ""))
      );
    });
    anComps = sortedAnmerkungsflaechen.map((annotationFeature) => {
      const sel = isFlaecheSelected(annotationFeature);

      const ap = (
        <AnnotationPanel
          key={"AnnotationPanel." + JSON.stringify(annotationFeature)}
          // ref={c => {
          //     that.flaechenPanelRefs[annotationFeature.id] = c;
          // }}
          annotationFeature={annotationFeature}
          selected={sel}
          showEditAnnoMenu={() => {
            dispatch(
              setChangeRequestsAnnotationEditViewAnnotationAndCR({
                annotation: annotationFeature,
                cr: {},
              })
            );
            dispatch(showChangeRequestAnnotationEditViewVisible(true));
          }}
        />
      );

      return ap;
    });
  }

  let contact;
  let creator = defaultContact;
  try {
    creator = kassenzeichen.stac_options.creatorUserName;
  } catch (e) {}
  if (kassenzeichen.contactinfo === undefined) {
    if (CONTACTS_MAP.has(creator)) {
      contact = CONTACTS_MAP.get(creator);
    } else {
      contact = CONTACTS_MAP.get(defaultContact);
    }
  } else {
    contact = kassenzeichen.contactinfo;
  }

  if (uiState.contactElementEnabled && kassenzeichen.id !== -1) {
    contactPanel = <ContactPanel contact={contact} />;
  }

  if (kassenzeichen.id !== -1) {
    kassenzeichenPanel = (
      <div>
        <KassenzeichenPanel />
      </div>
    );

    if (uiState.chartElementsEnabled) {
      kassenzeichenHorizontalFlaechenChartsPanel = (
        <KassenzeichenFlaechenChartPanel orientation="vertical" />
      );
      kassenzeichenVerticalFlaechenChartsPanel = (
        // <Flexbox height={"" + horizontalPanelHeight} minWidth={"" + horizontalPanelWidth}>
        <KassenzeichenFlaechenChartPanel orientation="horizontal" />
        // </Flexbox>
      );

      verdisMapWithAdditionalComponents = (
        <div>
          <div
            style={Object.assign({}, detailsStyle, {
              height: mapHeight + "px",
              width: verticalPanelWidth + "px",
              float: "right",
            })}
          >
            {contactPanel}
            {kassenzeichenPanel}
            {kassenzeichenHorizontalFlaechenChartsPanel}
            {anComps}
            {flComps}
          </div>
          <Map />
        </div>
      );
    }
  } else {
    verdisMapWithAdditionalComponents = (
      <div>
        <Map />
      </div>
    );
  }

  if (
    selectedFlaeche !== undefined &&
    selectedFlaeche !== null &&
    selectedFlaeche.properties.type !== "annotation" &&
    uiState.infoElementsEnabled
  ) {
    flaechenInfoOverlay = (
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 20,
          zIndex: 500,
          width: uiState.width - verticalPanelWidth - 40,
          opacity: 0.9,
        }}
      >
        <Alert
          variant="warning"
          onClose={() => {
            dispatch(toggleInfoElements({}));
          }}
          dismissible
        >
          {getOverlayTextForFlaeche(selectedFlaeche.properties, undefined)}
        </Alert>
      </div>
    );
  }

  return (
    <div>
      <Navbar />
      <Waiting
        key={
          "Waiting.visible." +
          uiState.waitingVisible +
          " ...message." +
          uiState.waitingMessage +
          " ...type." +
          uiState.waitingType
        }
      />
      <HelpAndSettings />
      <ChangeRequests height={mapHeight + 10} />
      <ChangeRequestEditView
        height={mapHeight + 10}
        visible={uiState.changeRequestEditViewVisible}
        showChangeRequestMenu={(storeIt) => {
          if (storeIt === true) {
            dispatch(
              setChangeRequestsForFlaeche(
                uiState.changeRequestEditViewFlaeche,
                uiState.changeRequestEditViewCR
              )
            );
          }
          dispatch(showChangeRequestsEditView(false));
        }}
        flaeche={uiState.changeRequestEditViewFlaeche}
        flaechenCR={uiState.changeRequestEditViewCR}
        setFlaechenCR={(cr) => {
          dispatch(
            setChangeRequestsEditViewFlaecheAndCR({
              flaeche: uiState.changeRequestEditViewFlaeche,
              cr,
            })
          );
        }}
        uploadCRDoc={addCRDoc}
        documents={documents}
        addFiles={(attachments) => {
          const msg = {
            typ: "CITIZEN",
            timestamp: Date.now(),
            draft: true,
            anhang: attachments,
          };

          dispatch(addChangeRequestMessage(msg));
        }}
        localErrorMessages={uiState.localErrorMessages}
        addLocalErrorMessage={addLocalErrorMessage}
      />
      <AnnotationEditView
        visible={uiState.changeRequestAnnotationEditViewVisible}
        annotationFeature={uiState.changeRequestAnnotationEditViewAnnotation}
        deleteAnnotation={() => {
          dispatch(
            removeAnnotation(uiState.changeRequestAnnotationEditViewAnnotation)
          );
        }}
        setNewAnnotation={(anno) => {
          dispatch(
            setChangeRequestsAnnotationEditViewAnnotationAndCR({
              annotation: anno,
              cr: {},
            })
          );
        }}
        showAnnotationEditView={(storeIt) => {
          if (storeIt === true) {
            dispatch(
              changeAnnotation(
                uiState.changeRequestAnnotationEditViewAnnotation
              )
            );
          }
          dispatch(showChangeRequestAnnotationEditViewVisible(false));
        }}
      />
      {verdisMapWithAdditionalComponents}
      {flaechenInfoOverlay}
      {draftAlert}
      {proofAlert}
    </div>
  );
};

export default KassenzeichenViewer;
