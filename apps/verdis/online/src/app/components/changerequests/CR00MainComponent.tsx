import { useDispatch, useSelector } from "react-redux";
import {
  addLocalErrorMessage,
  getUiState,
  setChangeRequestsScrollTarget,
  showChangeRequestsMenu,
  showSettings,
} from "../../../store/slices/ui";
import Section from "react-cismap/topicmaps/menu/Section";
import Introduction from "./CR05Introduction";
import {
  addChangeRequestMessage,
  addCRDoc,
  completeEmailChange,
  GeometryFeature,
  getKassenzeichen,
  getNumberOfPendingChanges,
  removeLastChangeRequestMessage,
  requestEmailChange,
  submitCR,
} from "../../../store/slices/kassenzeichen";
import CRConversation, { systemmessage } from "../conversations/CRConversation";
import { useEffect, useRef, useState } from "react";
import ConversationInput from "../conversations/ConversationInput";
import CR20DocumentsPanel from "./CR20DocumentsPanel";
import { Button, Modal } from "react-bootstrap";
import Toggle from "react-bootstrap-toggle";
import "./toggle.css";
import {
  scrollIntoModalBody,
  usePhoneVisualViewport,
} from "./usePhoneVisualViewport";
import "./CR00MainComponent.css";
import {
  AnderungswunscheHint,
  AnderungswunscheIntroductionAus,
  anderungswunscheSimpleTexts,
} from "@carma-collab/wuppertal/verdis-online";
import FlaechenPanel from "../FlaechenPanel";
import {
  colorNeededProof,
  hasAttachment,
  nachweisPflichtText,
  needsProof,
  needsProofSingleFlaeche,
} from "../../../utils/kassenzeichenHelper";
import AnnotationPanel from "../AnnotationPanel";
import { Icon } from "react-fa";
import Form from "react-bootstrap/Form";
import CloudLoadingAttributeIcon from "../commons/CloudLoadingAttributeIcon";
import PhoneCloseButton from "./PhoneCloseButton";
import type { CSSProperties, ReactElement } from "react";
import type { UnknownAction } from "redux";

const CR00MainComponent = ({ localErrorMessages = [], height }) => {
  const uiState = useSelector(getUiState);
  const kassenzeichen = useSelector(getKassenzeichen);
  const dispatch = useDispatch();
  const [contactemailInput, setContactemailInput] = useState("");
  const [
    contactemailVerificationCodeInput,
    setContactemailVerificationCodeInput,
  ] = useState("");
  const [locked, setLocked] = useState(true);
  const [emailSettingsShown, setEmailSettingsShown] = useState(true);
  const [hintExpanded, setHintExpanded] = useState(false);
  const [hideSystemMessages, setHideSystemMessages] = useState(false);
  const [codeVerificationInProgress, setCodeVerificationInProgress] =
    useState(false);
  const [codeVerificationMessage, setCodeVerificationMessage] = useState("");
  const scrollDivRef = useRef(null);
  const emailSectionRef = useRef<HTMLDivElement>(null);
  const contactemail = kassenzeichen.aenderungsanfrage
    ? kassenzeichen.aenderungsanfrage.emailAdresse
    : null;

  const draftHint = anderungswunscheSimpleTexts.draftHint;

  const { crDraftCounter } = getNumberOfPendingChanges(
    kassenzeichen.aenderungsanfrage
  );

  const crMessages =
    (kassenzeichen.aenderungsanfrage || { nachrichten: [] }).nachrichten || [];
  const messages = [...crMessages, ...(localErrorMessages || [])];
  const hasSystemMessages = messages.some(
    (msg) =>
      msg.typ === "SYSTEM" &&
      systemmessage(msg.nachrichtenParameter) !== undefined
  );
  const crEditMode = uiState.changeRequestsEditMode;
  const isPhone = uiState.width < 768;
  const menuVisible =
    uiState.changeRequestsMenuVisible === true &&
    uiState.applicationMenuVisible === false;
  usePhoneVisualViewport(isPhone && menuVisible);

  const scrollTarget = uiState.changeRequestsScrollTarget;
  const kassenzeichenLoaded = kassenzeichen.id !== -1;
  useEffect(() => {
    if (scrollTarget !== "email" || !menuVisible || !kassenzeichenLoaded) {
      return;
    }
    const timeout = setTimeout(() => {
      if (emailSectionRef.current) {
        scrollIntoModalBody(emailSectionRef.current, "start");
      }
      dispatch(setChangeRequestsScrollTarget(null));
    }, 600);
    return () => clearTimeout(timeout);
  }, [scrollTarget, menuVisible, kassenzeichenLoaded, dispatch]);

  const changerequests = kassenzeichen.aenderungsanfrage;
  const changerequestBezeichnungsArray = Object.keys(
    (changerequests || { flaechen: [] }).flaechen || []
  );

  const documents: any = [];
  let lastUserMessage = undefined;

  crMessages.forEach((msg) => {
    //if a document exists, add it to the documents array
    if (msg.anhang !== undefined && msg.anhang.length > 0) {
      msg.anhang.forEach((anhang) => {
        documents.push(anhang);
      });
    }

    if (msg.typ === "CITIZEN" && msg.draft === true) {
      lastUserMessage = msg;
    }
  });

  const origPanels: ReactElement[] = [];
  const crPanels: ReactElement[] = [];
  const phonePairs: ReactElement[] = [];
  const annoPanels: ReactElement[] = [];

  const phoneTitleStyle: CSSProperties = {
    fontSize: "14px",
    fontWeight: "bold",
    marginTop: 4,
    marginBottom: 4,
  };

  changerequestBezeichnungsArray.forEach((flaechenbezeichnung, index) => {
    //find flaeche
    const flaeche = kassenzeichen.flaechen.find(
      (fCand) => fCand.flaechenbezeichnung === flaechenbezeichnung
    );

    //get cr for flaeche
    const cr = changerequests.flaechen[flaechenbezeichnung];

    if (cr !== undefined && flaeche !== undefined) {
      const proofNeeded =
        needsProofSingleFlaeche(cr) &&
        !hasAttachment(kassenzeichen.aenderungsanfrage);
      if (isPhone) {
        phonePairs.push(
          <div
            key={"pair" + index}
            style={{
              paddingTop: index > 0 ? 10 : 0,
              marginTop: index > 0 ? 10 : 0,
              borderTop: index > 0 ? "1px solid #dee2e6" : undefined,
            }}
          >
            <div style={{ fontWeight: "bold", marginBottom: 2 }}>
              {`${flaeche.flaecheninfo?.flaechenart.art} ${flaeche.flaechenbezeichnung}`}
            </div>
            <div style={phoneTitleStyle}>aktueller Datenbestand</div>
            <FlaechenPanel
              flaeche={flaeche}
              editMode={false}
              flaechenCR={cr}
              isAllowClick={false}
              compact
            />
            <div style={phoneTitleStyle}>Ihr Änderungswunsch</div>
            <FlaechenPanel
              flaeche={flaeche}
              display={"cr"}
              flaechenCR={cr}
              editMode={false}
              proofNeeded={proofNeeded}
              isAllowClick={false}
              compact
            />
          </div>
        );
      } else {
        origPanels.push(
          <FlaechenPanel
            key={"orig." + index}
            flaeche={flaeche}
            editMode={false}
            flaechenCR={cr}
            isAllowClick={false}
          />
        );
        crPanels.push(
          <FlaechenPanel
            key={"cr" + index}
            flaeche={flaeche}
            display={"cr"}
            flaechenCR={cr}
            editMode={false}
            proofNeeded={proofNeeded}
            isAllowClick={false}
          />
        );
      }
    }
  });

  if (
    kassenzeichen !== undefined &&
    kassenzeichen.aenderungsanfrage !== undefined &&
    kassenzeichen.aenderungsanfrage !== null
  ) {
    const annos = kassenzeichen.aenderungsanfrage.geometrien;
    if (annos !== undefined) {
      const annoArr: GeometryFeature[] = [];

      for (const ak of Object.keys(annos)) {
        annoArr.push(annos[ak]);
      }

      const sortedAnnoArr = annoArr.sort(
        (a, b) => a.properties.numericId - b.properties.numericId
      );
      for (const a of sortedAnnoArr) {
        const ap = (
          <AnnotationPanel
            key={"AnnotationPanel" + JSON.stringify(a)}
            showEverything={true}
            annotationFeature={a}
            editmode={false}
          />
        );

        annoPanels.push(ap);
      }
    }
  }

  const scrollToVisible = (ref) => {
    if (ref && ref.current && !emailSettingsShown) {
      scrollIntoModalBody(ref.current, "end");
    }
  };

  const needsProofResult = needsProof(kassenzeichen.aenderungsanfrage);
  const unlockOrSubmit = () => {
    if (locked === true) {
      setLocked(false);
    } else {
      //submit
      dispatch(submitCR() as unknown as UnknownAction);
      setLocked(true);
    }
  };

  const titleStyle = {
    fontSize: "18px",
    marginTop: "10px",
    marginBottom: "10px",
  };

  const modalBodyStyle: CSSProperties = {
    overflowY: "auto",
    overflowX: "hidden",
    // on phones the dialog is full screen and the body fills the rest
    maxHeight: isPhone ? undefined : height - 350,
  };

  const close = () => {
    setLocked(true);
    dispatch(showChangeRequestsMenu(false));
    setEmailSettingsShown(true);
  };

  const changeEmail = (email) => {
    dispatch(requestEmailChange(email) as unknown as UnknownAction);
  };

  return (
    <Modal
      style={{
        zIndex: 3000000000,
      }}
      show={menuVisible}
      onHide={close}
      keyboard={false}
      size="xl"
      dialogClassName={isPhone ? "cr-modal-phone" : undefined}
    >
      <Modal.Header>
        <Modal.Title style={{ width: "100%" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: isPhone ? 8 : 6,
              fontSize: isPhone ? "1.15rem" : undefined,
              lineHeight: 1.25,
            }}
          >
            <Icon name={"edit"} style={{ flexShrink: 0 }} />
            <span>Änderungswünsche und Kommentare</span>
            <span style={{ marginLeft: "auto", flexShrink: 0 }}>
              <CloudLoadingAttributeIcon value={uiState.cloudStorageStatus} />
            </span>
            {isPhone && <PhoneCloseButton onClick={close} />}
          </div>
        </Modal.Title>
      </Modal.Header>
      <Modal.Body style={modalBodyStyle} id="myMenu">
        <Introduction />
        {isPhone && !crEditMode && (
          <div style={{ marginTop: 20 }}>
            <AnderungswunscheIntroductionAus />
          </div>
        )}
        {crEditMode
          ? [
              <table
                key="toolbar"
                style={{ marginTop: 15, marginBottom: 10 }}
                width="100%"
              >
                <tbody>
                  <tr>
                    <td>
                      <Button
                        className="pull-left"
                        id="cmdCloseModalApplicationMenu"
                        variant="success"
                        type="submit"
                        onClick={() => {
                          dispatch(showSettings({ visible: true }));
                        }}
                        style={{ margin: 5 }}
                      >
                        Hilfe
                      </Button>
                    </td>
                    <td>
                      {hasSystemMessages && (
                        <div
                          style={{
                            verticalAlign: "middle",
                            textAlign: "right",
                          }}
                        >
                          Systemnachrichten einblenden:{" "}
                          <Toggle
                            onClick={() => {
                              setHideSystemMessages(!hideSystemMessages);
                            }}
                            on={"Ein"}
                            off={"Aus"}
                            offstyle="danger"
                            onstyle="success"
                            size={"xs"}
                            active={!hideSystemMessages}
                            style={{ padding: 10 }}
                          />
                        </div>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>,
              <Section
                key="sectionKey0"
                sectionKey="sectionKey0"
                sectionTitle="Ihre Kommunikation"
                sectionBsStyle="info"
                setActiveSectionKey={() => {}}
                activeSectionKey={"sectionKey0"}
                sectionContent={
                  <>
                    <CRConversation
                      messages={messages}
                      hideSystemMessages={hideSystemMessages}
                    />
                    <ConversationInput
                      setDraft={(draftText, attachments) => {
                        const msg = {
                          typ: "CITIZEN",
                          timestamp: Date.now(),
                          nachricht: draftText,
                          draft: true,
                          anhang: attachments,
                        };

                        dispatch(
                          addChangeRequestMessage(
                            msg
                          ) as unknown as UnknownAction
                        );
                      }}
                      scrollToInput={() => {
                        setTimeout(() => {
                          scrollToVisible(scrollDivRef);
                        }, 10);
                      }}
                      lastUserMessage={lastUserMessage}
                      uploadCRDoc={addCRDoc}
                      addLocalErrorMessage={addLocalErrorMessage}
                      removeLastUserMessage={removeLastChangeRequestMessage}
                    />
                    <div ref={scrollDivRef} style={{ height: 1 }} />
                  </>
                }
              />,
              <Section
                key="sectionKey1"
                sectionKey="sectionKey1"
                setActiveSectionKey={() => {}}
                activeSectionKey={"sectionKey1"}
                sectionTitle={
                  "Ihre Änderungsvorschläge" +
                  (changerequestBezeichnungsArray.length > 0
                    ? " (" + changerequestBezeichnungsArray.length + ")"
                    : "")
                }
                sectionBsStyle="warning"
                sectionContent={
                  <div>
                    {phonePairs.length > 0 && phonePairs}
                    {origPanels.length > 0 && (
                      <div
                        style={{
                          display: "flex",
                          gap: "1rem",
                          flexDirection: "column",
                          width: "100%",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            gap: "1rem",
                          }}
                        >
                          <div style={{ flex: "1 1 auto" }}>
                            <div style={titleStyle}>aktueller Datenbestand</div>
                            {origPanels}
                          </div>
                          <div style={{ flex: "1 1 auto" }} />

                          <div style={{ flex: "1 1 auto" }}>
                            <div style={titleStyle}>Ihr Änderungswunsch</div>
                            {crPanels}
                          </div>
                        </div>
                      </div>
                    )}
                    {origPanels.length === 0 && phonePairs.length === 0 && (
                      <div style={{ color: "grey" }}>
                        keine Änderungsvorschläge vorhanden
                      </div>
                    )}
                  </div>
                }
              />,
              annoPanels.length > 0 && (
                <Section
                  key="sectionKey2"
                  sectionKey="sectionKey2"
                  setActiveSectionKey={() => {}}
                  activeSectionKey={"sectionKey2"}
                  sectionTitle={
                    "Ihre Anmerkungen in der Karte (" + annoPanels.length + ")"
                  }
                  sectionBsStyle="success"
                  sectionContent={<>{annoPanels}</>}
                />
              ),
              documents.length > 0 && (
                <Section
                  key="sectionDokumenteKey"
                  sectionKey="sectionDokumenteKey"
                  setActiveSectionKey={() => {}}
                  activeSectionKey={"sectionDokumenteKey"}
                  sectionTitle={"Ihre Dokumente (" + documents.length + ")"}
                  sectionBsStyle="danger"
                  sectionContent={<CR20DocumentsPanel documents={documents} />}
                />
              ),
              <div key="sectionKey3" ref={emailSectionRef}>
                <Section
                  sectionKey="sectionKey3"
                  sectionTitle="eMail Benachrichtigungen aktivieren"
                  sectionBsStyle="info"
                  activeSectionKey="sectionKey3"
                  setActiveSectionKey={() => {
                    setEmailSettingsShown(!emailSettingsShown);
                  }}
                  sectionContent={
                    <>
                      {(!contactemail && (
                        <div>
                          <p>
                            Um Benachrichtigungen bei Statusänderungen zu
                            erhalten können Sie hier eine eMail-Adresse
                            hinterlegen.
                          </p>
                          <Form inline data-cr-focus-anchor="nearest">
                            <Form.Group controlId="formInlineEmail">
                              <Form.Label>eMail-Adresse</Form.Label>{" "}
                              <Form.Control
                                style={{ width: "300px", marginLeft: "3px" }}
                                type="email"
                                placeholder="ihre@email.de"
                                onChange={(e) =>
                                  setContactemailInput(e.target.value)
                                }
                              />{" "}
                            </Form.Group>
                            <Button
                              variant="default"
                              onClick={() => {
                                changeEmail(contactemailInput);
                              }}
                            >
                              Senden
                            </Button>
                          </Form>
                          <p style={{ paddingTop: 15 }}>
                            Nach der Übermittlung Ihrer eMail Adresse schicken
                            wir Ihnen eine eMail mit einem Verifizierungscode.
                            Nachdem Sie den Code hier eingetragen haben, ist
                            Ihre eMail-Adresse für weiter Benachrichtigungen an
                            diesem Kassenzeichen hinterlegt.
                          </p>
                        </div>
                      )) ||
                        (!(kassenzeichen.aenderungsanfrage || {})
                          .emailVerifiziert && (
                          <div>
                            <p>
                              Bitte geben Sie hier den Code aus der
                              Verifikationsmail an
                            </p>
                            <span style={{ marginBottom: 15 }}>
                              <b>{contactemail}</b>
                              <Button
                                variant="danger"
                                onClick={() => {
                                  changeEmail(null);
                                }}
                                style={{ marginLeft: 20 }}
                              >
                                <Icon name={"trash"} />
                              </Button>
                            </span>

                            <Form
                              style={{ paddingTop: 10 }}
                              data-cr-focus-anchor="nearest"
                              onSubmit={(e) => e.preventDefault()}
                            >
                              <Form.Label htmlFor="formEmailVerificationCode">
                                Code
                              </Form.Label>
                              <div
                                style={{
                                  display: "flex",
                                  flexWrap: "wrap",
                                  alignItems: "center",
                                  gap: 8,
                                }}
                              >
                                <Form.Control
                                  id="formEmailVerificationCode"
                                  style={{ flex: "1 1 160px", maxWidth: 300 }}
                                  type="text"
                                  value={contactemailVerificationCodeInput}
                                  disabled={codeVerificationInProgress}
                                  placeholder="Code eingeben"
                                  onChange={(e) =>
                                    setContactemailVerificationCodeInput(
                                      e.target.value
                                    )
                                  }
                                />
                                <Button
                                  variant="success"
                                  disabled={
                                    codeVerificationInProgress ||
                                    contactemailVerificationCodeInput.length ===
                                      0
                                  }
                                  onClick={() => {
                                    setCodeVerificationInProgress(true);
                                    dispatch(
                                      completeEmailChange(
                                        contactemailVerificationCodeInput,
                                        (result) => {
                                          setContactemailVerificationCodeInput(
                                            ""
                                          );
                                          setCodeVerificationInProgress(false);
                                          if (
                                            (result.aenderungsanfrage || {})
                                              .emailVerifiziert
                                          ) {
                                            setCodeVerificationMessage(
                                              "Verifikation erfolgreich"
                                            );
                                          } else {
                                            setCodeVerificationMessage(
                                              "Verifikation fehlgeschlagen"
                                            );
                                          }
                                          setTimeout(() => {
                                            setCodeVerificationMessage("");
                                          }, 2500);
                                        }
                                      ) as unknown as UnknownAction
                                    );
                                  }}
                                >
                                  Senden
                                </Button>
                                <Button
                                  variant="default"
                                  onClick={() => {
                                    changeEmail(contactemail);
                                  }}
                                >
                                  Verifikationsmail erneut anfordern
                                </Button>
                                {codeVerificationMessage && (
                                  <span
                                    style={{
                                      color:
                                        codeVerificationMessage.indexOf(
                                          "erfolgreich"
                                        ) > -1
                                          ? "#70AE60"
                                          : "#B8473F",
                                    }}
                                  >
                                    {codeVerificationMessage}
                                  </span>
                                )}
                              </div>
                            </Form>
                            <p style={{ paddingTop: 15 }}>
                              Ihre eMail-Adresse ist für weiter
                              Benachrichtigungen an diesem Kassenzeichen
                              hinterlegt.
                            </p>
                          </div>
                        )) || (
                          <div>
                            <span style={{ marginBottom: 15 }}>
                              <b>{contactemail}</b>
                              <Button
                                variant="danger"
                                onClick={() => {
                                  changeEmail(null);
                                }}
                                style={{ marginLeft: 20 }}
                              >
                                <Icon name={"trash"} />
                              </Button>
                              <span
                                style={{
                                  paddingLeft: 10,
                                  color:
                                    codeVerificationMessage.indexOf(
                                      "erfolgreich"
                                    ) > -1
                                      ? "#70AE60"
                                      : "#B8473F",
                                }}
                              >
                                {codeVerificationMessage}
                              </span>
                            </span>
                            <p style={{ paddingTop: 15 }}>
                              Durch das Entfernen Ihrer eMail-Adresse erhalten
                              Sie keine weiteren Benachrichtigungen für dieses
                              Kassenzeichen.
                            </p>
                          </div>
                        )}
                    </>
                  }
                />
              </div>,
            ]
          : null}
      </Modal.Body>

      <Modal.Footer>
        {crEditMode === true && (
          <div style={isPhone ? { width: "100%" } : undefined}>
            {isPhone ? (
              <div
                style={{ textAlign: "left", marginBottom: 10, width: "100%" }}
              >
                <span
                  style={{
                    fontWeight: crDraftCounter > 0 ? "bold" : undefined,
                  }}
                >
                  ⚠ Änderungen erst nach Einreichen sichtbar
                </span>{" "}
                <Button
                  variant="link"
                  style={{ padding: 0, verticalAlign: "baseline" }}
                  onClick={() => {
                    setHintExpanded(!hintExpanded);
                  }}
                >
                  {hintExpanded ? "Weniger" : "Mehr…"}
                </Button>
                {hintExpanded && (
                  <div style={{ paddingTop: 8 }}>
                    <p>{draftHint}</p>
                    <AnderungswunscheHint />
                  </div>
                )}
              </div>
            ) : (
              <table
                style={{
                  width: "100%",
                }}
              >
                <tbody>
                  <tr>
                    <td
                      style={{
                        textAlign: "left",
                        verticalAlign: "top",
                        paddingRight: "30px",
                      }}
                    >
                      <p>
                        {crDraftCounter > 0 && <b>{draftHint}</b>}
                        {!(crDraftCounter > 0) && <span>{draftHint}</span>}
                      </p>
                      <p>
                        Sollten sich nach Abschluss der Bearbeitung Änderungen
                        gegenüber der bisherigen Gebührenerhebung ergeben,
                        erhalten Sie einen Änderungsbescheid durch das
                        Steueramt. Eine Veranlagung findet ggf. rückwirkend
                        statt. Maßgebend ist das Datum des Luftbilds, in dem die
                        Änderung feststellbar ist, aber längsten das laufende
                        und die 4 vorhergegangenen Jahre.
                      </p>
                    </td>
                    <td />
                  </tr>
                </tbody>
              </table>
            )}
            {needsProofResult && (
              <div
                style={{
                  textAlign: "left",
                  color: colorNeededProof,
                  margin: 2,
                  marginBottom: 10,
                }}
              >
                {nachweisPflichtText()}
              </div>
            )}
            <div
              style={{
                display: "flex",
                flexWrap: isPhone ? "nowrap" : "wrap",
                gap: isPhone ? "0.5rem" : "1rem",
                justifyContent: "flex-end",
              }}
            >
              <div style={isPhone ? { flex: "1 1 0" } : undefined}>
                <Button
                  style={{ width: isPhone ? "100%" : "200px" }}
                  id="cmdCloseModalApplicationMenu"
                  variant="default"
                  type="submit"
                  onClick={close}
                >
                  Schließen
                </Button>
                {!isPhone && (
                  <div style={{ fontSize: 11, textAlign: "end" }}>
                    es gehen keine Änderungen verloren
                  </div>
                )}
              </div>
              <div style={isPhone ? { flex: "1 1 0" } : undefined}>
                <Button
                  style={{ width: isPhone ? "100%" : "300px" }}
                  variant={locked === true ? "warning" : "success"}
                  className="fillButton"
                  onClick={unlockOrSubmit}
                  disabled={crDraftCounter === 0 || needsProofResult}
                >
                  <Icon name={locked === true ? "lock" : "unlock"} />{" "}
                  {crDraftCounter === 0
                    ? isPhone
                      ? "Keine Änderung"
                      : "Keine aktuelle Änderung"
                    : locked === true
                    ? isPhone
                      ? "Entsperren"
                      : "Entsperren zum Einreichen"
                    : isPhone
                    ? "Einreichen"
                    : "Einreichen der Änderungswünsche"}
                </Button>
              </div>
            </div>
            {isPhone && (
              <div style={{ fontSize: 11, textAlign: "left", width: "100%" }}>
                Beim Schließen gehen keine Änderungen verloren.
              </div>
            )}
          </div>
        )}
        {!crEditMode === true && (
          <div style={isPhone ? { width: "100%" } : undefined}>
            {!isPhone && <AnderungswunscheIntroductionAus />}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "2rem",
              }}
            >
              <Button
                className="pull-left"
                id="cmdCloseModalApplicationMenu"
                variant="success"
                type="submit"
                onClick={() => {
                  dispatch(showSettings({ visible: true }));
                }}
              >
                Hilfe
              </Button>
              <Button
                id="cmdCloseModalApplicationMenu"
                variant="primary"
                type="submit"
                onClick={close}
              >
                Ok
              </Button>
            </div>
          </div>
        )}
      </Modal.Footer>
    </Modal>
  );
};

export default CR00MainComponent;
