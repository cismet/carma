import { Alert, AlertContainer } from 'react-bs-notifier';
import Navbar from './Navbar';
import Waiting from './Waiting';
import Map from './Map';
import ContactPanel from './ContactPanel';
import { useSelector } from 'react-redux';
import { getKassenzeichen } from '../../store/slices/kassenzeichen';
import KassenzeichenPanel from './KassenzeichenPanel';
import KassenzeichenFlaechenChartPanel from './KassenzeichenFlaechenChartPanel';
import {
  getCRsForFlaeche,
  hasAttachment,
  kassenzeichenFlaechenSorter,
} from '../../utils/kassenzeichenHelper';
import FlaechenPanel from './FlaechenPanel';
import { getHeight } from '../../store/slices/ui';

const KassenzeichenViewer = () => {
  const kassenzeichen = useSelector(getKassenzeichen);
  const height = useSelector(getHeight);
  let flaechenPanelRefs = {};

  const verticalPanelWidth = 280;

  const horizontalPanelHeight = 150;
  const horizontalPanelWidth = 200;

  const switchToBottomWhenSmallerThan = 900;
  const detailsStyle = {
    backgroundColor: '#EEE',
    padding: '5px 5px 5px 5px',
    overflow: 'auto',
  };

  let crDraftCounter = 0;

  let draftAlert;
  if (crDraftCounter > 0) {
    draftAlert = (
      <div
        style={{
          position: 'absolute',
          top: 60,
          right: 285,
          zIndex: 500,
          width: 500,
          opacity: 0.9,
        }}
      >
        <Alert
          bsStyle="danger"
          onDismiss={() => {
            // this.props.uiStateActions.showChangeRequestsMenu(true);
          }}
        >
          <h5>
            <b>Sie haben momentan nicht eingereichte Änderungen.</b> Bitte
            beachten Sie, dass Änderungswünsche, Anmerkungen und Ihre
            hochgeladenen Dokumente erst für den Sachbearbeiter sichtbar werden,
            wenn sie die Änderungen freigegeben/entsperrt und eingereicht haben.
          </h5>
        </Alert>
      </div>
    );
  }

  let proofAlert;

  if (false) {
    proofAlert = (
      <div
        style={{
          position: 'absolute',
          top: crDraftCounter > 0 ? 195 : 60,
          right: 285,
          zIndex: 500,
          width: 500,
          opacity: 0.9,
        }}
      >
        <Alert
          bsStyle="danger"
          onDismiss={() => {
            // this.props.uiStateActions.showChangeRequestsMenu(true);
          }}
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

  if (kassenzeichen.flaechen) {
    flaechen = kassenzeichen.flaechen
      .concat()
      .sort(kassenzeichenFlaechenSorter);
  }

  let contactPanel = <div />;
  let kassenzeichenPanel = <div />;
  let kassenzeichenHorizontalFlaechenChartsPanel;
  let kassenzeichenVerticalFlaechenChartsPanel;
  let flComps: any = [];

  flComps = flaechen.map(function (flaeche) {
    // const sel = that.isFlaecheSelected(flaeche);
    const sel = false;
    const flaechenCR = getCRsForFlaeche(kassenzeichen, flaeche);
    const hasAttachments = hasAttachment(kassenzeichen.aenderungsanfrage);
    return (
      // <Flexbox
      //     key={"flex" + i++ + "." + flaeche.id}
      //     height={"" + horizontalPanelHeight}
      //     minWidth={"" + horizontalPanelWidth}
      // >
      <FlaechenPanel
        // ref={c => {
        //     that.flaechenPanelRefs[flaeche.id] = c;
        // }}
        // key={flaeche.id + "." + sel}
        selected={sel}
        // flaechenPanelClickHandler={that.flaechenPanelClick}
        flaeche={flaeche}
        // changerequest={flaechenCR}
        // editmode={that.props.uiState.changeRequestsEditMode}
        // proofNeeded={needsProofSingleFlaeche(flaechenCR) && !hasAttachments}
        // display={
        //     that.props.uiState.changeRequestsEditMode === true
        //         ? "cr"
        //         : "original"
        // }
      />
      // </Flexbox>
    );
  });

  if (kassenzeichen.id !== -1) {
    kassenzeichenPanel = (
      <div>
        <KassenzeichenPanel />
      </div>
    );
    kassenzeichenHorizontalFlaechenChartsPanel = (
      <KassenzeichenFlaechenChartPanel orientation="vertical" />
    );
    kassenzeichenVerticalFlaechenChartsPanel = (
      // <Flexbox height={"" + horizontalPanelHeight} minWidth={"" + horizontalPanelWidth}>
      <KassenzeichenFlaechenChartPanel orientation="horizontal" />
      // </Flexbox>
    );
  }

  contactPanel = <ContactPanel />;

  verdisMapWithAdditionalComponents = (
    <div>
      <div
        style={Object.assign({}, detailsStyle, {
          height: mapHeight + 'px',
          width: verticalPanelWidth + 'px',
          float: 'right',
        })}
      >
        {contactPanel}
        {kassenzeichenPanel}
        {kassenzeichenHorizontalFlaechenChartsPanel}
        {flComps}
      </div>
      <Map />
    </div>
  );

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
      {/* <HelpAndSettings
        showApplicationMenu={this.props.uiStateActions.showApplicationMenu}
        applicationMenuActiveKey={this.props.uiState.applicationMenuActiveKey}
        setApplicationMenuActiveKey={
          this.props.uiStateActions.setApplicationMenuActiveKey
        }
        applicationMenuVisible={this.props.uiState.applicationMenuVisible}
        height={this.props.uiState.height}
        selectedBackgroundIndex={this.props.mapping.selectedBackgroundIndex}
        backgrounds={this.props.mapping.backgrounds}
        setBackgroundIndex={
          this.props.mappingActions.setSelectedBackgroundIndex
        }
      /> */}
      {/* <ChangeRequests
        visible={
          this.props.uiState.changeRequestsMenuVisible === true &&
          this.props.uiState.applicationMenuVisible === false
        }
        showChangeRequestMenu={this.props.uiStateActions.showChangeRequestsMenu}
        height={mapHeight + 10}
        kassenzeichen={this.props.kassenzeichen}
        addMessage={this.props.kassenzeichenActions.addChangeRequestMessage}
        changeEmail={this.props.kassenzeichenActions.requestEmailChange}
        confirmEmail={this.props.kassenzeichenActions.completeEmailChange}
        removeLastUserMessage={
          this.props.kassenzeichenActions.removeLastChangeRequestMessage
        }
        uploadCRDoc={this.props.kassenzeichenActions.addCRDoc}
        crEditMode={this.props.uiState.changeRequestsEditMode}
        setCREditMode={this.props.uiStateActions.setChangeRequestInEditMode}
        submit={this.props.kassenzeichenActions.submitCR}
        cloudStorageStatus={this.props.uiState.cloudStorageStatus}
        documents={documents}
        showModalMenu={(activekey) => {
          if (activekey !== undefined) {
            this.props.uiStateActions.setApplicationMenuActiveKey(activekey);
          }
          this.props.uiStateActions.showApplicationMenu(true);
        }}
        localErrorMessages={this.props.uiState.localErrorMessages}
        addLocalErrorMessage={this.props.uiStateActions.addLocalErrorMessage}
      /> */}
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
      {verdisMapWithAdditionalComponents}
      {flaechenInfoOverlay}
      {draftAlert}
      {proofAlert}
    </div>
  );
};

export default KassenzeichenViewer;
