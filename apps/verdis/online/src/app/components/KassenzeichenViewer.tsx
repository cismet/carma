// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { Alert } from 'react-bootstrap';
import Navbar from './Navbar';
import Waiting from './Waiting';
import Map from './Map';
import ContactPanel from './ContactPanel';
import { useDispatch, useSelector } from 'react-redux';
import { getKassenzeichen } from '../../store/slices/kassenzeichen';
import KassenzeichenPanel from './KassenzeichenPanel';
import KassenzeichenFlaechenChartPanel from './KassenzeichenFlaechenChartPanel';
import {
  getCRsForFlaeche,
  getOverlayTextForFlaeche,
  hasAttachment,
  kassenzeichenFlaechenSorter,
} from '../../utils/kassenzeichenHelper';
import FlaechenPanel from './FlaechenPanel';
import {
  getHeight,
  getUiState,
  toggleInfoElements,
} from '../../store/slices/ui';
import { getMapping } from '../../store/slices/mapping';
import HelpAndSettings from '../components/helpandsettings/Menu00MainComponent';
import ChangeRequests from '../components/changerequests/CR00MainComponent';
import { getStac } from '../../store/slices/auth';
import { useNavigate } from 'react-router-dom';

const KassenzeichenViewer = () => {
  const kassenzeichen = useSelector(getKassenzeichen);
  const height = useSelector(getHeight);
  const uiState = useSelector(getUiState);
  const mapping = useSelector(getMapping);
  const stac = useSelector(getStac);
  const navigate = useNavigate();
  const dispatch = useDispatch();

  if (!stac) {
    navigate('/');
  }

  let flaechenPanelRefs = {};

  const verticalPanelWidth = 280;

  const isFlaecheSelected = (flaeche) => {
    return (
      mapping.featureCollection !== 'undefined' &&
      mapping.featureCollection.length > 0 &&
      mapping.selectedIndex !== 'undefined' &&
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
          variant="danger"
          dismissible
          onClose={() => {
            dispatch(toggleInfoElements({}));
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

  if (kassenzeichen.flaechen) {
    flaechen = kassenzeichen.flaechen
      .concat()
      .sort(kassenzeichenFlaechenSorter);
  }

  let contactPanel = <div />;
  let kassenzeichenPanel = <div />;
  let kassenzeichenHorizontalFlaechenChartsPanel;
  let kassenzeichenVerticalFlaechenChartsPanel;
  let flComps = [];

  flComps = flaechen.map(function (flaeche) {
    // const sel = that.isFlaecheSelected(flaeche);
    const sel = isFlaecheSelected(flaeche);
    const flaechenCR = getCRsForFlaeche(kassenzeichen, flaeche);
    const hasAttachments = hasAttachment(kassenzeichen.aenderungsanfrage);
    return (
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
    );
  });

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

  if (
    selectedFlaeche !== undefined &&
    selectedFlaeche !== null &&
    selectedFlaeche.properties.type !== 'annotation' &&
    uiState.infoElementsEnabled
  ) {
    flaechenInfoOverlay = (
      <div
        style={{
          position: 'absolute',
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
      {verdisMapWithAdditionalComponents}
      {flaechenInfoOverlay}
      {draftAlert}
      {proofAlert}
    </div>
  );
};

export default KassenzeichenViewer;
