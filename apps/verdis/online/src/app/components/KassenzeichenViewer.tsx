// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { Alert } from "react-bootstrap";
import Navbar from "./Navbar";
import Waiting from "./Waiting";
import Map from "./Map";
import ContactPanel from "./ContactPanel";
import { useDispatch, useSelector } from "react-redux";
import {
  changeAnnotation,
  getKassenzeichen,
  getKassenzeichenbySTAC,
  removeAnnotation,
} from "../../store/slices/kassenzeichen";
import KassenzeichenPanel from "./KassenzeichenPanel";
import KassenzeichenFlaechenChartPanel from "./KassenzeichenFlaechenChartPanel";
import {
  getCRsForFlaeche,
  getOverlayTextForFlaeche,
  hasAttachment,
  kassenzeichenFlaechenSorter,
} from "../../utils/kassenzeichenHelper";
import FlaechenPanel from "./FlaechenPanel";
import {
  getHeight,
  getUiState,
  setChangeRequestsAnnotationEditViewAnnotationAndCR,
  setChangeRequestsEditViewFlaecheAndCR,
  showChangeRequestAnnotationEditViewVisible,
  showChangeRequestsEditView,
  showInfo,
  toggleInfoElements,
} from "../../store/slices/ui";
import { getMapping } from "../../store/slices/mapping";
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

const KassenzeichenViewer = () => {
  const kassenzeichen = useSelector(getKassenzeichen);
  const height = useSelector(getHeight);
  const uiState = useSelector(getUiState);
  const mapping = useSelector(getMapping);
  const stac = useSelector(getStac);
  const login = useSelector(getSuccesfullLogin);
  const navigate = useNavigate();
  const dispatch = useDispatch();

  if (!stac) {
    navigate("/");
  } else {
    if (!login) {
      // dispatch(setLoginInProgress({}));
      // dispatch(showInfo("Kassenzeichen wird wieder geladen"));
      dispatch(getKassenzeichenbySTAC(stac, () => {}));
    }
  }

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

  let crDraftCounter = 0;

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
            dispatch(toggleInfoElements({}));
          }}
        >
          <KassenzeichenFlaechenChartPanel />
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

  console.log("xxx docs", documents);

  let proofAlert;

  if (false) {
    proofAlert = (
      <div
        style={{
          position: "absolute",
          top: crDraftCounter > 0 ? 195 : 60,
          right: 285,
          zIndex: 500,
          width: 500,
          opacity: 0.9,
        }}
      >
        <Alert
          variant="danger"
          onClose={() => {
            // this.props.uiStateActions.showChangeRequestsMenu(true);
          }}
          dismissible
        >
          {/* <h5>{nachweisPflichtText()}</h5> */}
        </Alert>
      </div>
    );
  }

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
        changerequest={flaechenCR}
        editmode={uiState.changeRequestsEditMode}
        // proofNeeded={needsProofSingleFlaeche(flaechenCR) && !hasAttachments}
        // display={
        //     that.props.uiState.changeRequestsEditMode === true
        //         ? "cr"
        //         : "original"
        // }
        showEditCRMenu={() => {
          dispatch(
            setChangeRequestsEditViewFlaecheAndCR({ flaeche, flaechenCR })
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
          // inPolyEditMode={that.props.mapping.idsInEdit.includes(
          //     annotationFeature.id
          // )}
          // togglePolyEditMode={() => {
          //     if (
          //         that.props.mapping.idsInEdit.includes(
          //             annotationFeature.id
          //         )
          //     ) {
          //         const newIds = that.props.mapping.idsInEdit.filter(
          //             id => id !== annotationFeature.id
          //         );
          //         that.props.mappingActions.setIdsInEdit(newIds);
          //     } else {
          //         const newIds = JSON.parse(
          //             JSON.stringify(that.props.mapping.idsInEdit)
          //         );
          //         newIds.push(annotationFeature.id);
          //         that.props.mappingActions.setIdsInEdit(newIds);
          //     }
          // }}
          // clickHandler={that.flaechenPanelClick}
          //map={this.verdisMap.wrappedInstance.leafletRoutedMap}
          // layer={getLayerForFeatureId(
          // 	this.verdisMap.wrappedInstance.leafletRoutedMap,
          // 	annotationFeature.id
          // )}
        />
      );

      return ap;
    });
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
    }
  }

  if (uiState.contactElementEnabled && kassenzeichen.id !== -1) {
    contactPanel = <ContactPanel />;
  }

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
          {getOverlayTextForFlaeche(
            selectedFlaeche.properties,
            undefined
            // this.props.uiState.changeRequestsEditMode === true
            //     ? getCRsForFlaeche(this.props.kassenzeichen, {
            //           flaechenbezeichnung: selectedFlaeche.properties.bez
            //       })
            //     : undefined
          )}
        </Alert>
      </div>
    );
  }

  return (
    <div>
      <Navbar />
      <Waiting
      // key={
      //   'Waiting.visible.' +
      //   this.props.uiState.waitingVisible +
      //   ' ...message.' +
      //   this.props.uiState.waitingMessage +
      //   ' ...type.' +
      //   this.props.uiState.waitingType
      // }
      />
      <HelpAndSettings />
      <ChangeRequests />
      {/* <ChangeRequestEditView
        height={mapHeight + 10}
        visible={this.props.uiState.changeRequestEditViewVisible}
        showChangeRequestMenu={(storeIt) => {
          if (storeIt === true) {
            this.props.kassenzeichenActions.setChangeRequestsForFlaeche(
              this.props.uiState.changeRequestEditViewFlaeche,
              this.props.uiState.changeRequestEditViewCR
            );
          }
          this.props.uiStateActions.showChangeRequestsEditView(false);
        }}
        flaeche={this.props.uiState.changeRequestEditViewFlaeche}
        flaechenCR={this.props.uiState.changeRequestEditViewCR}
        setFlaechenCR={(cr) => {
          this.props.uiStateActions.setChangeRequestsEditViewFlaecheAndCR(
            this.props.uiState.changeRequestEditViewFlaeche,
            cr
          );
        }}
        uploadCRDoc={this.props.kassenzeichenActions.addCRDoc}
        documents={documents}
        addFiles={(attachments) => {
          const msg = {
            typ: 'CITIZEN',
            timestamp: Date.now(),
            draft: true,
            anhang: attachments,
          };

          this.props.kassenzeichenActions.addChangeRequestMessage(msg);
        }}
        localErrorMessages={this.props.uiState.localErrorMessages}
        addLocalErrorMessage={this.props.uiStateActions.addLocalErrorMessage}
      /> */}
      {/* <AnnotationEditView
        height={mapHeight + 10}
        visible={this.props.uiState.changeRequestAnnotationEditViewVisible}
        annotationFeature={
          this.props.uiState.changeRequestAnnotationEditViewAnnotation
        }
        setNewAnnotation={(anno) => {
          this.props.uiStateActions.setChangeRequestsAnnotationEditViewAnnotationAndCR(
            anno
          );
        }}
        showAnnotationEditView={(storeIt) => {
          if (storeIt === true) {
            this.props.kassenzeichenActions.changeAnnotation(
              this.props.uiState.changeRequestAnnotationEditViewAnnotation
            );
          }
          this.props.uiStateActions.showChangeRequestsAnnotationEditView(false);
        }}
        deleteAnnotation={this.props.kassenzeichenActions.removeAnnotation}
      /> */}
      <ChangeRequestEditView
        // height={mapHeight + 10}
        visible={uiState.changeRequestEditViewVisible}
        showChangeRequestMenu={(storeIt) => {
          // if (storeIt === true) {
          //     this.props.kassenzeichenActions.setChangeRequestsForFlaeche(
          //         this.props.uiState.changeRequestEditViewFlaeche,
          //         this.props.uiState.changeRequestEditViewCR
          //     );
          // }
          dispatch(showChangeRequestsEditView(false));
        }}
        flaeche={uiState.changeRequestEditViewFlaeche}
        // flaechenCR={this.props.uiState.changeRequestEditViewCR}
        // setFlaechenCR={cr => {
        //     this.props.uiStateActions.setChangeRequestsEditViewFlaecheAndCR(
        //         this.props.uiState.changeRequestEditViewFlaeche,
        //         cr
        //     );
        // }}
        // uploadCRDoc={this.props.kassenzeichenActions.addCRDoc}
        documents={documents}
        // addFiles={attachments => {
        //     const msg = {
        //         typ: "CITIZEN",
        //         timestamp: Date.now(),
        //         draft: true,
        //         anhang: attachments
        //     };

        //     this.props.kassenzeichenActions.addChangeRequestMessage(msg);
        // }}
        // localErrorMessages={this.props.uiState.localErrorMessages}
        // addLocalErrorMessage={this.props.uiStateActions.addLocalErrorMessage}
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
