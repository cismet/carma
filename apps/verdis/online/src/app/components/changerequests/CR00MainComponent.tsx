// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { useDispatch, useSelector } from "react-redux";
import { getUiState, showChangeRequests } from "../../../store/slices/ui";
import ModalApplicationMenu from "react-cismap/topicmaps/menu/ModalApplicationMenu";
import Section from "react-cismap/topicmaps/menu/Section";
import Introduction from "./CR05Introduction";
import {
  getKassenzeichen,
  getNumberOfPendingChanges,
} from "../../../store/slices/kassenzeichen";
import CRConversation from "../conversations/CRConversation";
import { useState } from "react";
import ConversationInput from "../conversations/ConversationInput";
import CR20DocumentsPanel from "./CR20DocumentsPanel";
import { Button } from "react-bootstrap";
import Toggle from "react-bootstrap-toggle";
import "./toggle.css";
import {
  AnderungswunscheIntroductionAus,
  anderungswunscheSimpleTexts,
  AnderungswunscheHint,
} from "@carma-collab/wuppertal/verdis-online";
import FlaechenPanel from "../FlaechenPanel";
import {
  hasAttachment,
  needsProofSingleFlaeche,
} from "../../../utils/kassenzeichenHelper";
import AnnotationPanel from "../AnnotationPanel";

const CR00MainComponent = ({ localErrorMessages = [] }) => {
  const uiState = useSelector(getUiState);
  const kassenzeichen = useSelector(getKassenzeichen);
  const dispatch = useDispatch();
  const [hideSystemMessages, setHideSystemMessages] = useState(false);

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

  sMsgs.forEach((msg) => {
    //if a document exists, add it to the documents array
    if (msg.anhang !== undefined && msg.anhang.length > 0) {
      msg.anhang.forEach((anhang) => {
        documents.push(anhang);
      });
    }
  });

  const origPanels = [];
  const crPanels = [];
  const annoPanels = [];
  let lastUserMessage = undefined;
  // const sMsgs = changerequestMessagesArray.sort((a, b) => a.timestamp - b.timestamp);
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
          />
        );
      }

      if (
        kassenzeichen !== undefined &&
        kassenzeichen.aenderungsanfrage !== undefined &&
        kassenzeichen.aenderungsanfrage !== null
      ) {
        const annos = kassenzeichen.aenderungsanfrage.geometrien;
        if (annos !== undefined) {
          const annoArr = [];

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
              />
            );

            annoPanels.push(ap);
          }
        }
      }
    }
  );

  return (
    <ModalApplicationMenu
      menuIcon={"edit"}
      menuTitle={anderungswunscheSimpleTexts.andrTitle}
      // menuFooter={<></>}
      menuIntroduction={<Introduction />}
      visible={uiState.changeRequestsMenuVisible}
      setVisible={(value) => dispatch(showChangeRequests({ visible: value }))}
      menuSections={
        crEditMode
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
                          // showModalMenu("anleitung");
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
                sectionContent={
                  <>
                    <CRConversation
                      messages={messages}
                      hideSystemMessages={hideSystemMessages}
                    />
                    {/* <ConversationInput /> */}
                  </>
                }
              />,
              <Section
                key="sectionKey1"
                sectionKey="sectionKey1"
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
                          <div>
                            <h4>aktueller Datenbestand</h4>
                            {origPanels.map((panel) => {
                              return <div>{panel}</div>;
                            })}
                          </div>
                          {/* <div column grow /> */}

                          <div>
                            <h4>Ihr Änderungswunsch</h4>
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
                sectionTitle={"Ihre Anmerkungen in der Karte"}
                sectionBsStyle="success"
                sectionContent={<></>}
              />,
              <Section
                key="sectionKey2"
                sectionKey="sectionKey2"
                sectionTitle={
                  "Ihre Dokumente" +
                  (documents.length > 0 ? " (" + documents.length + ")" : "")
                }
                sectionBsStyle="danger"
                sectionContent={<CR20DocumentsPanel documents={documents} />}
              />,
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
                      <AnderungswunscheHint />
                    </td>
                    <td />
                  </tr>
                </tbody>
              </table>,
              <Section
                key="sectionKey3"
                sectionKey="sectionKey3"
                sectionTitle="eMail Benachrichtigungen aktivieren"
                sectionBsStyle="info"
                sectionContent={<></>}
              />,
            ]
          : [
              <div>
                <AnderungswunscheIntroductionAus />
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
            ]
      }
    />
  );
};

export default CR00MainComponent;
