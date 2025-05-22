import Color from "color";
import React, { useState } from "react";
import Section from "react-cismap/topicmaps/menu/Section";
import { Icon } from "react-fa";
import FlaechenPanel from "../FlaechenPanel";
import DocPanel from "./CR20DocumentsPanel";
import {
  getProcessedFlaechenCR,
  flaechenarten,
  anschlussgrade,
  getOverlayTextForFlaeche,
  needsProofSingleFlaeche,
} from "../../../utils/kassenzeichenHelper";
import Button from "react-bootstrap/Button";
import Modal from "react-bootstrap/Modal";
import Form from "react-bootstrap/Form";
import { Flaeche } from "../../../store/slices/kassenzeichen";
import type { CSSProperties } from "react";

interface CR00Props {
  visible: boolean;
  height: number;
  showChangeRequestMenu: (open: boolean) => void;
  flaeche: Flaeche;
  flaechenCR: any; // you can tighten this up once you have a CR type
  setFlaechenCR: (cr: any) => void;
  documents: any[];
  uploadCRDoc: (file: File, callback: (res: string) => void) => void;
  addFiles: (files: any[]) => void;
  localErrorMessages: any[];
  addLocalErrorMessage: (msg: any) => void;
}

const CR00 = ({
  visible,
  height,
  showChangeRequestMenu = (arg: boolean) => {},
  flaeche,
  flaechenCR = {},
  setFlaechenCR = (cr: any) => {},
  documents = [],
  uploadCRDoc = (file: any, callback: any) => {},
  addFiles = (tmpAtt) => {},
  localErrorMessages = [],
  addLocalErrorMessage = (msg: string) => {},
}: CR00Props) => {
  const [tmpAttachments, setTmpAttachments] = useState<any[]>([]);
  const modalBodyStyle: CSSProperties = {
    overflowY: "auto",
    overflowX: "hidden",
    maxHeight: height - 200,
  };
  const close = () => {
    if (tmpAttachments.length > 0) {
      addFiles(tmpAttachments);
      setTmpAttachments([]);
    }
    if (JSON.stringify(flaechenCR) !== "{}") {
      showChangeRequestMenu(true);
    } else {
      showChangeRequestMenu(false);
    }
  };
  const cancel = () => {
    showChangeRequestMenu(false);
    setTmpAttachments([]);
  };

  const proofNeeded =
    needsProofSingleFlaeche(flaechenCR) &&
    documents?.length === 0 &&
    tmpAttachments.length === 0;

  const setNewFlaechenCR = (cr) => {
    cr.draft = true;
    setFlaechenCR(cr);
  };

  const isAnteiligeFlaeche = () => {
    return flaeche.anteil !== undefined && flaeche.anteil !== null;
  };

  const titleStyle = {
    fontSize: "18px",
    marginTop: "10px",
    marginBottom: "10px",
  };

  if (visible !== false) {
    const crInfo = getProcessedFlaechenCR(flaeche, flaechenCR);
    return (
      <Modal
        style={{
          zIndex: 3000000000,
        }}
        size="lg"
        height="100%"
        show={visible}
        onHide={cancel}
        keyboard={false}
      >
        <Modal.Header>
          <Modal.Title>
            <Icon name={"edit"} />{" "}
            {`Änderungen an ${flaeche?.flaecheninfo?.flaechenart.art} ${flaeche.flaechenbezeichnung}`}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body
          style={modalBodyStyle}
          id="myMenu"
          key={"applicationMenuActiveKey"}
        >
          <p>
            Wenn Sie konkrete Änderungswünsche haben, können Sie diese im
            untenstehenden Formular (gelb umrahmter Bereich) direkt der Fläche
            zuordnen. Bitte beachten Sie, dass Sie bestimmte Änderungen mit
            Dokumenten belegen müssen. Alle Dokumente, die Ihrem Kassenzeichen
            zugeordnet sind, finden Sie im rot umrahmten Bereich. Dort können
            Sie auch neue Dokumente hochladen.
          </p>
          <Section
            key={"sectionKey0"}
            sectionKey={"sectionKey0"}
            activeSectionKey={"sectionKey0"}
            style={{ marginBottom: 6 }}
            sectionBsStyle="info"
            sectionTitle={"Übersicht "}
            setActiveSectionKey={() => {}}
            sectionContent={
              <div
                style={{
                  display: "flex",
                  flexDirection: "row",
                  justifyContent: "space-around",
                  alignItems: "flex-start",
                  minHeight: "0px",
                  minWidth: "0px",
                }}
              >
                <div style={{ flex: "1 1 auto" }}>
                  <div style={titleStyle}>aktueller Datenbestand</div>
                  <FlaechenPanel flaeche={flaeche} editMode={false} />
                </div>
                <div style={{ flex: "1 1 auto" }} />
                <div style={{ flex: "1 1 auto" }}>
                  <div style={titleStyle}>Ihr Änderungswunsch</div>
                  <FlaechenPanel
                    key={"cr"}
                    flaeche={flaeche}
                    editMode={false}
                    display={"cr"}
                    flaechenCR={flaechenCR}
                    proofNeeded={proofNeeded}
                  />
                </div>
              </div>
            }
          />
          <Section
            key={"sectionKey1"}
            sectionKey={"sectionKey1"}
            style={{ marginBottom: 6 }}
            sectionBsStyle="warning"
            setActiveSectionKey={() => {}}
            activeSectionKey={"sectionKey1"}
            sectionTitle={`Ihre Änderungsvorschläge${
              crInfo.changeCounter > 0 ? " (" + crInfo.changeCounter + ")" : ""
            }`}
            sectionContent={
              <Form>
                <Form.Group
                  controlId="formControlsTextarea"
                  //   validationState={crInfo.validationStates.groesse}
                  className="customLeftAlignedValidation"
                >
                  {isAnteiligeFlaeche() === false && (
                    <Form.Label>Größe in m²</Form.Label>
                  )}

                  {isAnteiligeFlaeche() === true && (
                    <Form.Label>
                      Größe in m² (Hier nicht änderbar, da eine Anteilsfläche
                      vorliegt.)
                    </Form.Label>
                  )}
                  <Form.Control
                    disabled={isAnteiligeFlaeche()}
                    style={{
                      background: new Color(
                        crInfo.colors.groesse === "black"
                          ? "white"
                          : crInfo.colors.groesse
                      ).alpha(0.1),
                    }}
                    onChange={(e) => {
                      if (isAnteiligeFlaeche() === false) {
                        const newCR = JSON.parse(JSON.stringify(flaechenCR));
                        newCR.groesse = Number(e.target.value);
                        setNewFlaechenCR(newCR);
                      }
                    }}
                    value={crInfo.groesse}
                  />
                  <Form.Control.Feedback />
                </Form.Group>
                <Form.Group
                  controlId="formControlSelectFlaechenart"
                  className="customLeftAlignedValidation"
                >
                  <Form.Label>
                    Flächenart{" "}
                    {isAnteiligeFlaeche() && (
                      <span>
                        (Hier nicht änderbar, da eine Anteilsfläche vorliegt.)
                      </span>
                    )}
                  </Form.Label>
                  <Form.Control
                    as="select"
                    disabled={isAnteiligeFlaeche()}
                    style={{
                      background: new Color(
                        crInfo.colors.flaechenart === "black"
                          ? "white"
                          : crInfo.colors.flaechenart
                      ).alpha(0.1),
                    }}
                    value={crInfo.art?.art_abkuerzung}
                    onChange={(e) => {
                      const newCR = JSON.parse(JSON.stringify(flaechenCR));
                      newCR.flaechenart = flaechenarten.find(
                        (val) => val.art_abkuerzung === e.target.value
                      );
                      setNewFlaechenCR(newCR);
                    }}
                    isInvalid={!!crInfo.validationStates.flaechenart}
                  >
                    {flaechenarten.map((otherart) => (
                      <option
                        key={otherart.art_abkuerzung}
                        value={otherart.art_abkuerzung}
                      >
                        {otherart.art}
                      </option>
                    ))}
                  </Form.Control>
                  <Form.Control.Feedback type="invalid">
                    Bitte wählen Sie eine gültige Flächenart.
                  </Form.Control.Feedback>
                </Form.Group>

                <Form.Group
                  controlId="formControlSelectAnschlussgrad"
                  className="customLeftAlignedValidation"
                >
                  <Form.Label>
                    Anschlussgrad{" "}
                    {isAnteiligeFlaeche() && (
                      <span>
                        (Hier nicht änderbar, da eine Anteilsfläche vorliegt.)
                      </span>
                    )}
                  </Form.Label>
                  <Form.Control
                    as="select"
                    disabled={isAnteiligeFlaeche()}
                    style={{
                      background: new Color(
                        crInfo.colors.anschlussgrad === "black"
                          ? "white"
                          : crInfo.colors.anschlussgrad
                      ).alpha(0.1),
                    }}
                    value={crInfo.anschlussgrad?.grad_abkuerzung}
                    onChange={(e) => {
                      const newCR = JSON.parse(JSON.stringify(flaechenCR));
                      newCR.anschlussgrad = anschlussgrade.find(
                        (val) => val.grad_abkuerzung === e.target.value
                      );
                      setNewFlaechenCR(newCR);
                    }}
                    isInvalid={!!crInfo.validationStates.anschlussgrad}
                  >
                    {anschlussgrade.map((grad) => (
                      <option
                        key={grad.grad_abkuerzung}
                        value={grad.grad_abkuerzung}
                      >
                        {grad.grad}
                      </option>
                    ))}
                  </Form.Control>
                  <Form.Control.Feedback type="invalid">
                    Bitte wählen Sie einen gültigen Anschlussgrad.
                  </Form.Control.Feedback>
                </Form.Group>
              </Form>
            }
          />
          <Section
            key={"sectionKey3"}
            sectionKey={"sectionKey3"}
            activeSectionKey={"sectionKey3"}
            style={{ marginBottom: 6 }}
            sectionBsStyle="info"
            sectionTitle={`Hinweise zur Gebührenerhebung`}
            setActiveSectionKey={() => {}}
            sectionContent={getOverlayTextForFlaeche(flaeche, flaechenCR)}
          />
          <Section
            key={"sectionKey4"}
            sectionKey={"sectionKey4"}
            activeSectionKey={"sectionKey4"}
            style={{ marginBottom: 6 }}
            sectionBsStyle="danger"
            setActiveSectionKey={() => {}}
            sectionTitle={`Ihre Dokumente 
                                    ${
                                      documents.length > 0
                                        ? " (" + documents.length + ")"
                                        : ""
                                    }`}
            sectionContent={
              <DocPanel
                uploadCRDoc={uploadCRDoc}
                documents={documents}
                tmpAttachments={tmpAttachments}
                setTmpAttachments={setTmpAttachments}
                localErrorMessages={localErrorMessages}
                addLocalErrorMessage={addLocalErrorMessage}
              />
            }
          />
        </Modal.Body>

        <Modal.Footer>
          <table
            style={{
              width: "100%",
              border: "1",
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
                  <p
                  // style={{
                  //     fontWeight: proofNeeded ? "bold" : "normal",
                  //     color: proofNeeded ? "#B55959" : "black"
                  // }}
                  >
                    Um unnötige Verzögerungen zu vermeiden, achten Sie bitte
                    darauf bei nachweispflichtigen Änderungen die entsprechenden
                    Belege hinzuzufügen.
                  </p>
                </td>
              </tr>
            </tbody>
          </table>
          <Button
            id="cmdCloseModalApplicationMenu"
            variant="warning"
            type="submit"
            onClick={cancel}
          >
            Abbrechen
          </Button>
          <Button
            id="cmdCloseModalApplicationMenu"
            variant="primary"
            type="submit"
            onClick={close}
          >
            Übernehmen
          </Button>
        </Modal.Footer>
      </Modal>
    );
  } else {
    return null;
  }
};
export default CR00;
