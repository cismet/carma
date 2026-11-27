import StatusNotification from "./StatusNotification";
import NotificationStack from "./NotificationStack";
import FlaechenInfoBox from "./FlaechenInfoBox";
import AnnotationInfoBox from "./AnnotationInfoBox";
import Navbar from "./Navbar";
import Waiting from "./Waiting";
import Map from "./Map";
import ContactPanel from "./ContactPanel";
import { useDispatch, useSelector } from "react-redux";
import {
  addChangeRequestMessage,
  addCRDoc,
  changeAnnotation,
  completeEmailChange,
  Flaeche,
  GeometryFeature,
  getKassenzeichen,
  getKassenzeichenbySTAC,
  getNumberOfPendingChanges,
  removeAnnotation,
  setChangeRequestsForFlaeche,
} from "../../store/slices/kassenzeichen";
import KassenzeichenPanel from "./KassenzeichenPanel";
import { PANELS_AT_BOTTOM_BELOW_WIDTH } from "../../constants/ui";
import KassenzeichenFlaechenChartPanel from "./KassenzeichenFlaechenChartPanel";
import {
  getInfoTextsForFlaeche,
  getOverlayTextForFlaeche,
  hasAttachment,
  kassenzeichenFlaechenSorter,
  getCRsForFlaeche,
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
  showChangeRequestsMenu,
  setChangeRequestsScrollTarget,
  showChangeRequestsEditView,
  showInfo,
  showWaiting,
  toggleInfoElements,
  setHintVisible,
  showInfoWithError,
  getNavbarHeight,
} from "../../store/slices/ui";
import {
  fitAll,
  fitFeatureBounds,
  getMapping,
  setSelectedFeatureIndexWithSelector,
} from "../../store/slices/mapping";
import HelpAndSettings from "../components/helpandsettings/Menu00MainComponent";
import ChangeRequests from "../components/changerequests/CR00MainComponent";
import { getStac, getSuccesfullLogin } from "../../store/slices/auth";
import { useLocation, useNavigate } from "react-router-dom";
import AnnotationPanel from "./AnnotationPanel";
import ChangeRequestEditView from "../components/changerequests/CR50Flaechendialog";
import AnnotationEditView from "../components/changerequests/CR60AnnotationDialog";
import CONTACTS_MAP, { defaultContact } from "../../constants/contacts";
import { useEffect, useState } from "react";
import "./KassenzeichenViewer.css";
import queryString from "query-string";
import { removeQueryPart } from "../../utils/routingHelper";
import sysend from "sysend";
import type { UnknownAction } from "redux";
import type { CSSProperties, ReactElement } from "react";

const KassenzeichenViewer = () => {
  const kassenzeichen = useSelector(getKassenzeichen);
  const height = useSelector(getHeight);
  const uiState = useSelector(getUiState);
  const navbarHeight = useSelector(getNavbarHeight);
  const [draftAlertDismissed, setDraftAlertDismissed] = useState(false);
  const [phoneInfoOpen, setPhoneInfoOpen] = useState(false);
  const mapping = useSelector(getMapping);
  const stac = useSelector(getStac);
  const login = useSelector(getSuccesfullLogin);

  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();

  const reloadOnEmailVerification = () => {
    const changeRequestMenuVisible =
      uiState.changeRequestsMenuVisible === true &&
      uiState.applicationMenuVisible === false;
    if (changeRequestMenuVisible) {
      navigate(
        {
          pathname: location.pathname,
          search: "?crOpen=email",
        },
        { replace: true }
      );
    }
    window.location.reload();
  };

  useEffect(() => {
    if (!stac) {
      navigate("/");
    } else {
      if (!login) {
        dispatch(showInfo("Kassenzeichen wird wieder geladen"));
        dispatch(showWaiting(true));
        dispatch(
          getKassenzeichenbySTAC(stac, (success) => {
            if (success === true) {
              setTimeout(() => {
                dispatch(showWaiting(false));
                dispatch(fitAll() as unknown as UnknownAction);
              }, 300);
            }
          }) as unknown as UnknownAction
        );
      }
    }

    setTimeout(() => {
      dispatch(setHintVisible(false));
    }, 10000);

    sysend.on("reloadOnEmailVerification", () => {
      reloadOnEmailVerification();
    });

    return () => {
      sysend.off("reloadOnEmailVerification");
    };
  }, [uiState.changeRequestsMenuVisible]);

  const kassenzeichenLoaded = kassenzeichen.id !== -1;
  useEffect(() => {
    const { emailVerificationCode } = queryString.parse(location.search);

    if (emailVerificationCode !== undefined && kassenzeichenLoaded) {
      dispatch(
        completeEmailChange(emailVerificationCode, (result) => {
          dispatch(setChangeRequestsScrollTarget("email"));
          if ((result.aenderungsanfrage || {}).emailVerifiziert) {
            sysend.broadcast("reloadOnEmailVerification");

            dispatch(showInfo("Verifizierung erfolgreich"));
            dispatch(showWaiting(true));
            setTimeout(() => {
              dispatch(showWaiting(false));
            }, 1500);
          } else {
            dispatch(
              showInfoWithError(
                "Verifizierung fehlgeschlagen"
              ) as unknown as UnknownAction
            );

            setTimeout(() => {
              dispatch(showWaiting(false));
            }, 2500);
          }
        }) as unknown as UnknownAction
      );

      const cleanSearch = removeQueryPart(
        location.search,
        "emailVerificationCode"
      );

      navigate(
        {
          pathname: location.pathname,
          search: cleanSearch,
        },
        { replace: true }
      );
    }
  }, [
    location.search,
    location.pathname,
    kassenzeichenLoaded,
    dispatch,
    navigate,
  ]);

  useEffect(() => {
    const crOpen = queryString.parse(location.search).crOpen;

    if (crOpen !== undefined) {
      dispatch(showChangeRequestsMenu({ visible: true }));
      if (crOpen === "email") {
        dispatch(setChangeRequestsScrollTarget("email"));
      }
      const cleanSearch = removeQueryPart(location.search, "crOpen");
      navigate(
        {
          pathname: location.pathname,
          search: cleanSearch,
        },
        { replace: true }
      );
    }
  }, [location.search]);

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

  let selectedFlaeche: GeometryFeature | null = null;
  if (mapping.selectedIndex !== undefined && mapping.selectedIndex !== -1) {
    selectedFlaeche = mapping.featureCollection[mapping.selectedIndex];
  }

  const panelsAtBottom = uiState.width < PANELS_AT_BOTTOM_BELOW_WIDTH;
  const chartShown = uiState.chartElementsEnabled || panelsAtBottom;
  const contactShown = uiState.contactElementEnabled || panelsAtBottom;
  const bottomLayoutMapHeight = height - navbarHeight;
  const overlayGap = 4;
  const overlaySideGap = 10;
  const compactNotificationWidth = 320;
  const detailsStyle: CSSProperties = {
    backgroundColor: "#EEE",
    padding: "5px 5px 5px 5px",
    overflow: "auto",
  };

  let { crDraftCounter } = getNumberOfPendingChanges(
    kassenzeichen.aenderungsanfrage
  );
  let draftAlert;
  if (crDraftCounter > 0 && !draftAlertDismissed) {
    draftAlert = (
      <StatusNotification
        variant="danger"
        compact={panelsAtBottom}
        title={
          panelsAtBottom
            ? "Nicht eingereichte Änderungen"
            : "Sie haben momentan nicht eingereichte Änderungen."
        }
        onClose={() => {
          setDraftAlertDismissed(true);
        }}
        action={
          panelsAtBottom
            ? {
                label: "Zu den Änderungen",
                onClick: () => {
                  dispatch(showChangeRequestsMenu({ visible: true }));
                  dispatch(setChangeRequestsScrollTarget("message"));
                },
              }
            : undefined
        }
      >
        Bitte beachten Sie, dass Änderungswünsche, Anmerkungen und Ihre
        hochgeladenen Dokumente erst für den Sachbearbeiter sichtbar werden,
        wenn sie die Änderungen freigegeben/entsperrt und eingereicht haben.
      </StatusNotification>
    );
  }

  const changerequests = kassenzeichen.aenderungsanfrage;

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
  let mapHeight = height - 68;
  let flaechen = [];
  let anmerkungsflaechen: GeometryFeature[] = [];

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
  let kassenzeichenFlaechenChartsPanel;
  let anComps: ReactElement[] = [];
  let flComps: ReactElement[] = [];

  flComps = flaechen.map(function (flaeche: Flaeche) {
    const sel = isFlaecheSelected(flaeche);
    const flaechenCR = getCRsForFlaeche(kassenzeichen, flaeche);
    const hasAttachments = hasAttachment(kassenzeichen.aenderungsanfrage);
    return (
      <FlaechenPanel
        key={flaeche.id + "." + sel}
        selected={sel}
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

  if (kassenzeichen.id !== -1) {
    kassenzeichenPanel = (
      <div>
        <KassenzeichenPanel />
      </div>
    );
  }

  if (contactShown && kassenzeichen.id !== -1) {
    contactPanel = <ContactPanel contact={contact} />;
  }

  if (chartShown && kassenzeichen.id !== -1) {
    kassenzeichenFlaechenChartsPanel = (
      <KassenzeichenFlaechenChartPanel
        orientation={panelsAtBottom ? "compact" : "vertical"}
      />
    );
  }

  const flaecheIsSelected =
    selectedFlaeche !== undefined &&
    selectedFlaeche !== null &&
    selectedFlaeche.properties.type !== "annotation";

  const selectedFlaecheCR =
    flaecheIsSelected &&
    selectedFlaeche &&
    uiState.changeRequestsEditMode === true
      ? getCRsForFlaeche(kassenzeichen, {
          flaechenbezeichnung: selectedFlaeche.properties.bez,
        })
      : undefined;

  const selectAndFit = (id: string | number) => {
    dispatch(
      setSelectedFeatureIndexWithSelector(
        (feature) => feature.properties.id === id
      ) as unknown as UnknownAction
    );
    const feature = mapping.featureCollection.find(
      (f) => f.properties.id === id
    );
    if (feature) {
      dispatch(fitFeatureBounds(feature, "") as unknown as UnknownAction);
    }
  };

  if (
    panelsAtBottom &&
    uiState.changeRequestsEditMode === true &&
    selectedFlaeche &&
    selectedFlaeche.properties.type === "annotation"
  ) {
    flaechenInfoOverlay = (
      <AnnotationInfoBox
        annotations={[...anmerkungsflaechen].sort(
          (a, b) =>
            Number(a.id.replace("anno.", "")) -
            Number(b.id.replace("anno.", ""))
        )}
        selectedId={selectedFlaeche.properties.id}
        onSelect={(annotation) => selectAndFit(annotation.id)}
        onEdit={(annotation) => {
          dispatch(
            setChangeRequestsAnnotationEditViewAnnotationAndCR({
              annotation,
              cr: {},
            })
          );
          dispatch(showChangeRequestAnnotationEditViewVisible(true));
        }}
      />
    );
  } else if (panelsAtBottom && flaecheIsSelected && selectedFlaeche) {
    // on phones the sidebar's Fläche cards live in the map, as an InfoBox
    flaechenInfoOverlay = (
      <FlaechenInfoBox
        flaechen={flaechen}
        selectedId={selectedFlaeche.properties.id}
        editMode={uiState.changeRequestsEditMode === true}
        getCR={(flaeche) => getCRsForFlaeche(kassenzeichen, flaeche)}
        hints={
          uiState.infoElementsEnabled
            ? getInfoTextsForFlaeche(
                selectedFlaeche.properties,
                selectedFlaecheCR
              )
            : undefined
        }
        onSelect={(flaeche) => selectAndFit(flaeche.id)}
        onEdit={(flaeche, cr) => {
          dispatch(setChangeRequestsEditViewFlaecheAndCR({ flaeche, cr }));
          dispatch(showChangeRequestsEditView(true));
        }}
      />
    );
  } else if (
    !panelsAtBottom &&
    flaecheIsSelected &&
    selectedFlaeche &&
    uiState.infoElementsEnabled
  ) {
    flaechenInfoOverlay = (
      <StatusNotification
        variant="warning"
        onClose={() => {
          dispatch(toggleInfoElements({}));
        }}
      >
        {getOverlayTextForFlaeche(
          selectedFlaeche.properties,
          selectedFlaecheCR
        )}
      </StatusNotification>
    );
  }

  let nothingEnabled =
    !chartShown &&
    !uiState.kanalElementsEnabled &&
    !uiState.filterElementEnabled &&
    !uiState.detailElementsEnabled;

  if (kassenzeichen.id === -1 || nothingEnabled) {
    verdisMapWithAdditionalComponents = (
      <div>
        <Map />
      </div>
    );
  } else if (panelsAtBottom) {
    verdisMapWithAdditionalComponents = (
      <div>
        <Map newHeight={height - navbarHeight}>
          {!phoneInfoOpen && flaechenInfoOverlay}
        </Map>
        {phoneInfoOpen && (
          <>
            <div className="phone-info-panel" style={{ top: navbarHeight }}>
              {contactPanel}
              {kassenzeichenPanel}
              {kassenzeichenFlaechenChartsPanel}
            </div>
          </>
        )}
      </div>
    );
  } else {
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
          {kassenzeichenFlaechenChartsPanel}
          {anComps}
          {flComps}
        </div>
        <Map newHeight={mapHeight} />
      </div>
    );
  }

  return (
    <div>
      <Navbar
        {...(panelsAtBottom &&
          kassenzeichen.id !== -1 &&
          !nothingEnabled && {
            onBrandClick: () => setPhoneInfoOpen((open) => !open),
            brandExpanded: phoneInfoOpen,
          })}
      />
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
              ) as unknown as UnknownAction
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

          dispatch(addChangeRequestMessage(msg) as unknown as UnknownAction);
        }}
        localErrorMessages={uiState.localErrorMessages}
        addLocalErrorMessage={addLocalErrorMessage}
      />
      <AnnotationEditView
        visible={uiState.changeRequestAnnotationEditViewVisible}
        annotationFeature={uiState.changeRequestAnnotationEditViewAnnotation}
        deleteAnnotation={() => {
          dispatch(
            removeAnnotation(
              uiState.changeRequestAnnotationEditViewAnnotation
            ) as unknown as UnknownAction
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
              ) as unknown as UnknownAction
            );
          }
          dispatch(showChangeRequestAnnotationEditViewVisible(false));
        }}
      />
      {verdisMapWithAdditionalComponents}
      {panelsAtBottom ? (
        <NotificationStack
          items={[...(draftAlert ? [{ key: "draft", node: draftAlert }] : [])]}
          style={{
            position: "absolute",
            top: navbarHeight + overlayGap,
            right: overlaySideGap,
            maxWidth: Math.min(
              compactNotificationWidth,
              uiState.width - 2 * overlaySideGap
            ),
            maxHeight: bottomLayoutMapHeight - 2 * overlayGap,
            overflowY: "auto",
            zIndex: 650,
            pointerEvents: "none",
          }}
        />
      ) : (
        <>
          {flaechenInfoOverlay && (
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: 20,
                zIndex: 500,
                opacity: 0.9,
                width: uiState.width - verticalPanelWidth - 40,
              }}
            >
              {flaechenInfoOverlay}
            </div>
          )}
          {draftAlert && (
            <div
              style={{
                position: "absolute",
                top: navbarHeight + overlayGap,
                right: verticalPanelWidth + overlayGap,
                zIndex: 500,
                opacity: 0.9,
                width: Math.min(500, uiState.width - verticalPanelWidth - 70),
              }}
            >
              {draftAlert}
            </div>
          )}
        </>
      )}
      {proofAlert}
    </div>
  );
};

export default KassenzeichenViewer;
