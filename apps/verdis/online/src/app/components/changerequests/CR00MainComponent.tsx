import { useDispatch, useSelector } from "react-redux";
import {
  addLocalErrorMessage,
  getUiState,
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
import CRConversation from "../conversations/CRConversation";
import { useRef, useState } from "react";
import ConversationInput from "../conversations/ConversationInput";
import CR20DocumentsPanel from "./CR20DocumentsPanel";
import { Button, Modal } from "react-bootstrap";
import Toggle from "react-bootstrap-toggle";
import "./toggle.css";
import {
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
  const [emailSettingsShown, setEmailSettingsShown] = useState(false);
  const [hideSystemMessages, setHideSystemMessages] = useState(false);
  const [codeVerificationInProgress, setCodeVerificationInProgress] =
    useState(false);
  const [codeVerificationMessage, setCodeVerificationMessage] = useState("");
  const scrollDivRef = useRef(null);
  const contactemail = kassenzeichen.aenderungsanfrage
    ? kassenzeichen.aenderungsanfrage.emailAdresse
    : null;

  const draftHint = anderungswunscheSimpleTexts.draftHint;

  const { crDraftCounter } = getNumberOfPendingChanges(
    kassenzeichen.aenderungsanfrage
  );

  const crMessages =
    (kassenzeichen.aenderungsanfrage || { nachrichten: [] }).nachrichten || [];
  const messages = [...(crMessages || []), ...(localErrorMessages || [])];
  const crEditMode = uiState.changeRequestsEditMode;

  const changerequests = kassenzeichen.aenderungsanfrage;
  const changerequestBezeichnungsArray =
    Object.keys((changerequests || { flaechen: [] }).flaechen || []) || [];

  const changerequestMessagesArray =
    (changerequests || { nachrichten: [] }).nachrichten || [];
  const sMsgs = changerequestMessagesArray;
  const documents: any = [];
  let lastUserMessage = undefined;

  sMsgs.forEach((msg) => {
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
  const annoPanels: ReactElement[] = [];

  (changerequestBezeichnungsArray || []).forEach(
    (flaechenbezeichnung, index) => {
      //find flaeche
      const flaeche = kassenzeichen.flaechen.find(
        (fCand) => fCand.flaechenbezeichnung === flaechenbezeichnung
      );

      //get cr for flaeche
      const cr = changerequests.flaechen[flaechenbezeichnung];

      if (cr !== undefined && flaeche !== undefined) {
        origPanels.push(
          <FlaechenPanel
            key={"orig." + index}
            flaeche={flaeche}
            editMode={false}
            flaechenCR={cr ? cr : {}}
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
            proofNeeded={
              needsProofSingleFlaeche(cr) &&
              !hasAttachment(kassenzeichen.aenderungsanfrage)
            }
            isAllowClick={false}
          />
        );
      }
    }
  );

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
      ref.current.scrollIntoView({
        behavior: "smooth",
        block: "end",
        inline: "nearest",
      });
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
      //then
      //close();
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
    maxHeight: height - (emailSettingsShown ? 520 : 350),
  };

  const close = () => {
    setLocked(true);
    dispatch(showChangeRequestsMenu(false));
    setEmailSettingsShown(false);
  };

  const changeEmail = (email) => {
    dispatch(requestEmailChange(email) as unknown as UnknownAction);
  };

  return (
    <Modal
      style={{
        zIndex: 3000000000,
      }}
      height="100%"
      bsSize={crEditMode === true ? "large" : undefined} //undefined == mid
      show={
        uiState.changeRequestsMenuVisible === true &&
        uiState.applicationMenuVisible === false
      }
      onHide={close}
      keyboard={false}
      size="xl"
    >
      <Modal.Header>
        <Modal.Title style={{ width: "100%" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
            }}
          >
            <Icon name={"edit"} /> {"Änderungswünsche und Kommentare"}
            <span style={{ marginLeft: "auto" }}>
              <CloudLoadingAttributeIcon value={uiState.cloudStorageStatus} />
            </span>
          </div>
        </Modal.Title>
      </Modal.Header>
      <Modal.Body
        style={modalBodyStyle}
        id="myMenu"
        key={"applicationMenuActiveKey"}
      >
        <Introduction />
        {crEditMode
          ? [
              <table style={{ marginTop: 15, marginBottom: 10 }} width="100%">
                <tbody>
                  <tr>
                    <td>
                      <Button
                        className="pull-left"
                        id="cmdCloseModalApplicationMenu"
                        variant="success"
                        type="submit"
                        onClick={() => {
                          // dispatch(showChangeRequests(false));
                          dispatch(showSettings({ visible: true }));
                        }}
                        //hier gehts weiter
                        style={{ margin: 5 }}
                      >
                        Hilfe
                      </Button>
                    </td>
                    <td>
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
                  (changerequestBezeichnungsArray !== undefined &&
                  changerequestBezeichnungsArray.length > 0
                    ? " (" + changerequestBezeichnungsArray.length + ")"
                    : "")
                }
                sectionBsStyle="warning"
                sectionContent={
                  <div>
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
                            {origPanels.map((panel) => {
                              return <div>{panel}</div>;
                            })}
                          </div>
                          <div style={{ flex: "1 1 auto" }} />

                          <div style={{ flex: "1 1 auto" }}>
                            <div style={titleStyle}>Ihr Änderungswunsch</div>
                            {crPanels.map((panel) => {
                              return <div>{panel}</div>;
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                    {origPanels.length === 0 && (
                      <div style={{ color: "grey" }}>
                        keine Änderungsvorschläge vorhanden
                      </div>
                    )}
                  </div>
                }
              />,
              <Section
                key="sectionKey2"
                sectionKey="sectionKey2"
                setActiveSectionKey={() => {}}
                activeSectionKey={"sectionKey2"}
                sectionTitle={
                  "Ihre Anmerkungen in der Karte" +
                  (annoPanels.length > 0 ? " (" + annoPanels.length + ")" : "")
                }
                sectionBsStyle="success"
                sectionContent={<>{annoPanels}</>}
              />,
              <Section
                key="sectionDokumenteKey"
                sectionKey="sectionDokumenteKey"
                setActiveSectionKey={() => {}}
                activeSectionKey={"sectionDokumenteKey"}
                sectionTitle={
                  "Ihre Dokumente" +
                  (documents.length > 0 ? " (" + documents.length + ")" : "")
                }
                sectionBsStyle="danger"
                sectionContent={<CR20DocumentsPanel documents={documents} />}
              />,
              // <table
              //   style={{
              //     width: "100%",
              //   }}
              // >
              //   <tbody>
              //     <tr>
              //       <td
              //         style={{
              //           textAlign: "left",
              //           verticalAlign: "top",
              //           paddingRight: "30px",
              //         }}
              //       >
              //         <p>
              //           {crDraftCounter > 0 && <b>{draftHint}</b>}
              //           {!(crDraftCounter > 0) && <span>{draftHint}</span>}
              //         </p>
              //         <AnderungswunscheHint />
              //       </td>
              //       <td />
              //     </tr>
              //   </tbody>
              // </table>,
            ]
          : [
              <div>
                {/* <AnderungswunscheIntroductionAus /> */}
                {/* <Button
                  className="pull-left"
                  id="cmdCloseModalApplicationMenu"
                  bsStyle="success"
                  type="submit"
                  onClick={() => {
                    // showModalMenu("anleitung");
                  }}
                >
                  Hilfe
                </Button>
                <Button
                  id="cmdCloseModalApplicationMenu"
                  bsStyle="primary"
                  type="submit"
                  onClick={close}
                >
                  Ok
                </Button> */}
              </div>,
            ]}
      </Modal.Body>

      <Modal.Footer>
        {crEditMode === true && (
          <div>
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
                      erhalten Sie einen Änderungsbescheid durch das Steueramt.
                      Eine Veranlagung findet ggf. rückwirkend statt. Maßgebend
                      ist das Datum des Luftbilds, in dem die Änderung
                      feststellbar ist, aber längsten das laufende und die 4
                      vorhergegangenen Jahre.
                    </p>
                  </td>
                  <td />
                </tr>
              </tbody>
            </table>
            <Section
              key="sectionKey3"
              sectionKey="sectionKey3"
              // activeSectionKey={"sectionKey3"}
              sectionTitle="eMail Benachrichtigungen aktivieren"
              sectionBsStyle="info"
              setActiveSectionKey={() => {
                setEmailSettingsShown(!emailSettingsShown);
              }}
              sectionContent={
                <>
                  {((kassenzeichen.aenderungsanfrage || {}).emailAdresse ===
                    undefined && (
                    <div>
                      <p>
                        Um Benachrichtigungen bei Statusänderungen zu erhalten
                        können Sie hier eine eMail-Adresse hinterlegen.
                      </p>
                      <Form inline>
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
                        Nach der Übermittlung Ihrer eMail Adresse schicken wir
                        Ihnen eine eMail mit einem Verifizierungscode. Nachdem
                        Sie den Code hier eingetragen haben, ist Ihre
                        eMail-Adresse für weiter Benachrichtigungen an diesem
                        Kassenzeichen hinterlegt.
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

                        <Form style={{ paddingTop: 10 }} inline>
                          <Form.Group controlId="formInlineEmail">
                            <Form.Label>
                              <span style={{ marginRight: "3px" }}>Code</span>
                            </Form.Label>{" "}
                            <Form.Control
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
                          </Form.Group>
                          <span style={{ marginLeft: 5 }} />
                          <Button
                            variant="success"
                            disabled={
                              codeVerificationInProgress ||
                              contactemailVerificationCodeInput.length === 0
                            }
                            onClick={() => {
                              setCodeVerificationInProgress(true);
                              dispatch(
                                completeEmailChange(
                                  contactemailVerificationCodeInput,
                                  (result) => {
                                    setContactemailVerificationCodeInput("");
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
                          <span style={{ marginLeft: "3px" }}>
                            <Button
                              variant="default"
                              onClick={() => {
                                changeEmail(contactemail);
                              }}
                            >
                              Verifikationsmail erneut anfordern
                            </Button>
                          </span>
                          <span
                            style={{
                              paddingLeft: 10,
                              color:
                                codeVerificationMessage.indexOf("erfolgreich") >
                                -1
                                  ? "#70AE60"
                                  : "#B8473F",
                            }}
                          >
                            {codeVerificationMessage}
                          </span>
                        </Form>
                        <p style={{ paddingTop: 15 }}>
                          Ihre eMail-Adresse ist für weiter Benachrichtigungen
                          an diesem Kassenzeichen hinterlegt.
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
                                codeVerificationMessage.indexOf("erfolgreich") >
                                -1
                                  ? "#70AE60"
                                  : "#B8473F",
                            }}
                          >
                            {codeVerificationMessage}
                          </span>
                        </span>
                        <p style={{ paddingTop: 15 }}>
                          Durch das Entfernen Ihrer eMail-Adresse erhalten Sie
                          keine weiteren Benachrichtigungen für dieses
                          Kassenzeichen.
                        </p>
                      </div>
                    )}
                </>
              }
            />
            ,
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
                flexWrap: "wrap",
                gap: "1rem",
                justifyContent: "flex-end",
              }}
            >
              <div>
                <Button
                  style={{ width: "200px" }}
                  id="cmdCloseModalApplicationMenu"
                  variant="default"
                  type="submit"
                  onClick={close}
                >
                  Schließen
                </Button>
                <div style={{ fontSize: 11, textAlign: "end" }}>
                  es gehen kein Änderungen verloren
                </div>
              </div>
              <div>
                <Button
                  style={{ width: "300px" }}
                  variant={locked === true ? "warning" : "success"}
                  className="fillButton"
                  onClick={unlockOrSubmit}
                  disabled={crDraftCounter === 0 || needsProofResult}
                >
                  <Icon name={locked === true ? "lock" : "unlock"} />{" "}
                  {crDraftCounter === 0
                    ? "Keine aktuelle Änderung"
                    : locked === true
                    ? "Entsperren zum Einreichen"
                    : "Einreichen der Änderungswünsche"}
                </Button>
              </div>
            </div>
          </div>
        )}
        {!crEditMode === true && (
          <div>
            <AnderungswunscheIntroductionAus />
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
                  // dispatch(showChangeRequests(false));
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
