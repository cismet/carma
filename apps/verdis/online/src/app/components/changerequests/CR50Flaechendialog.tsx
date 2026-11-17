import Color from "color";
import React, { useRef, useState } from "react";
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
import { useSelector } from "react-redux";
import { getUiState } from "../../../store/slices/ui";
import "./CR00MainComponent.css";
import { phoneTitleStyle } from "./phoneModalStyles";
import PhoneModalFooter from "./PhoneModalFooter";
import PhoneCloseButton from "./PhoneCloseButton";
import ExpandableHint from "./ExpandableHint";
import PhoneSelect from "./PhoneSelect";
import AreaInput from "./AreaInput";
import {
  afterKeyboardSettles,
  usePhoneVisualViewport,
} from "./usePhoneVisualViewport";

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
  const isPhone = useSelector(getUiState).width < 768;
  usePhoneVisualViewport(isPhone && visible !== false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const changesSectionRef = useRef<HTMLDivElement>(null);
  const scrollToChanges = (e: React.FocusEvent) => {
    if (
      !isPhone ||
      !(
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
    ) {
      return;
    }
    afterKeyboardSettles(() => {
      const body = bodyRef.current;
      const section = changesSectionRef.current;
      if (!body || !section) {
        return;
      }
      const top =
        section.getBoundingClientRect().top -
        body.getBoundingClientRect().top +
        body.scrollTop;
      body.scrollTo({ top, behavior: "smooth" });
    });
  };
  const modalBodyStyle: CSSProperties = {
    overflowY: "auto",
    overflowX: "hidden",
    maxHeight: isPhone ? undefined : height - 200,
    fontSize: isPhone ? "0.95rem" : undefined,
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

  const introText =
    "Wenn Sie konkrete Änderungswünsche haben, können Sie diese im untenstehenden Formular (gelb umrahmter Bereich) direkt der Fläche zuordnen. Bitte beachten Sie, dass Sie bestimmte Änderungen mit Dokumenten belegen müssen. Alle Dokumente, die Ihrem Kassenzeichen zugeordnet sind, finden Sie im rot umrahmten Bereich. Dort können Sie auch neue Dokumente hochladen.";

  const titleStyle: CSSProperties = isPhone
    ? { fontSize: "14px", fontWeight: "bold", marginTop: 4, marginBottom: 4 }
    : { fontSize: "18px", marginTop: "10px", marginBottom: "10px" };

  if (visible !== false) {
    const crInfo = getProcessedFlaechenCR(flaeche, flaechenCR);
    const current = getProcessedFlaechenCR(flaeche, {});
    const hasChanges =
      crInfo.groesse !== current.groesse ||
      crInfo.art !== current.art ||
      crInfo.anschlussgrad !== current.anschlussgrad;
    const fieldBackground = (color: string) =>
      new Color(color === "black" ? "white" : color).alpha(0.1).string();
    const changeFlaechenart = (artAbkuerzung: string) => {
      const newCR = JSON.parse(JSON.stringify(flaechenCR));
      newCR.flaechenart = flaechenarten.find(
        (val) => val.art_abkuerzung === artAbkuerzung
      );
      setNewFlaechenCR(newCR);
    };
    const changeAnschlussgrad = (gradAbkuerzung: string) => {
      const newCR = JSON.parse(JSON.stringify(flaechenCR));
      newCR.anschlussgrad = anschlussgrade.find(
        (val) => val.grad_abkuerzung === gradAbkuerzung
      );
      setNewFlaechenCR(newCR);
    };
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
        dialogClassName={isPhone ? "cr-modal-phone" : undefined}
      >
        <Modal.Header>
          <Modal.Title style={phoneTitleStyle(isPhone)}>
            <Icon name={"edit"} style={{ flexShrink: 0 }} />{" "}
            <span>{`Änderungen an ${flaeche?.flaecheninfo?.flaechenart.art} ${flaeche.flaechenbezeichnung}`}</span>
          </Modal.Title>
          {isPhone && <PhoneCloseButton onClick={cancel} />}
        </Modal.Header>
        <Modal.Body
          ref={bodyRef}
          style={modalBodyStyle}
          id="myMenu"
          key={"applicationMenuActiveKey"}
        >
          {isPhone ? (
            <ExpandableHint
              icon="ℹ"
              hint="Änderungen eintragen und mit Dokumenten belegen"
              details={introText}
              style={{ marginBottom: 10 }}
            />
          ) : (
            <p>{introText}</p>
          )}
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
                  flexDirection: isPhone ? "column" : "row",
                  justifyContent: "space-around",
                  alignItems: isPhone ? "stretch" : "flex-start",
                  minHeight: "0px",
                  minWidth: "0px",
                }}
              >
                <div style={{ flex: "1 1 auto" }}>
                  <div style={titleStyle}>aktueller Datenbestand</div>
                  <FlaechenPanel
                    flaeche={flaeche}
                    editMode={false}
                    compact={isPhone}
                  />
                </div>
                {!isPhone && <div style={{ flex: "1 1 auto" }} />}
                <div style={{ flex: "1 1 auto" }}>
                  <div style={titleStyle}>Ihr Änderungswunsch</div>
                  {isPhone && !hasChanges ? (
                    <div style={{ color: "#6c757d" }}>
                      Noch keine Änderungen
                    </div>
                  ) : (
                    <FlaechenPanel
                      key={"cr"}
                      flaeche={flaeche}
                      editMode={false}
                      display={"cr"}
                      flaechenCR={flaechenCR}
                      proofNeeded={proofNeeded}
                      compact={isPhone}
                    />
                  )}
                </div>
              </div>
            }
          />
          <div ref={changesSectionRef} onFocus={scrollToChanges}>
            <Section
              key={"sectionKey1"}
              sectionKey={"sectionKey1"}
              style={{ marginBottom: 6 }}
              sectionBsStyle="warning"
              setActiveSectionKey={() => {}}
              activeSectionKey={"sectionKey1"}
              sectionTitle={`Ihre Änderungsvorschläge${
                crInfo.changeCounter > 0
                  ? " (" + crInfo.changeCounter + ")"
                  : ""
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
                    <AreaInput
                      disabled={isAnteiligeFlaeche()}
                      style={{
                        background: fieldBackground(crInfo.colors.groesse),
                      }}
                      value={crInfo.groesse}
                      onChange={(groesse) => {
                        const newCR = JSON.parse(JSON.stringify(flaechenCR));
                        if (groesse === undefined) {
                          delete newCR.groesse;
                        } else {
                          newCR.groesse = groesse;
                        }
                        setNewFlaechenCR(newCR);
                      }}
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
                    {isPhone ? (
                      <PhoneSelect
                        id="formControlSelectFlaechenart"
                        disabled={isAnteiligeFlaeche()}
                        style={{
                          background: fieldBackground(
                            crInfo.colors.flaechenart
                          ),
                        }}
                        value={crInfo.art?.art_abkuerzung}
                        options={flaechenarten.map((otherart) => ({
                          value: otherart.art_abkuerzung,
                          label: otherart.art,
                        }))}
                        onChange={changeFlaechenart}
                        isInvalid={!!crInfo.validationStates.flaechenart}
                      />
                    ) : (
                      <Form.Control
                        as="select"
                        disabled={isAnteiligeFlaeche()}
                        style={{
                          background: fieldBackground(
                            crInfo.colors.flaechenart
                          ),
                        }}
                        value={crInfo.art?.art_abkuerzung}
                        onChange={(e) => changeFlaechenart(e.target.value)}
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
                    )}
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
                    {isPhone ? (
                      <PhoneSelect
                        id="formControlSelectAnschlussgrad"
                        disabled={isAnteiligeFlaeche()}
                        style={{
                          background: fieldBackground(
                            crInfo.colors.anschlussgrad
                          ),
                        }}
                        value={crInfo.anschlussgrad?.grad_abkuerzung}
                        options={anschlussgrade.map((grad) => ({
                          value: grad.grad_abkuerzung,
                          label: grad.grad,
                        }))}
                        onChange={changeAnschlussgrad}
                        isInvalid={!!crInfo.validationStates.anschlussgrad}
                      />
                    ) : (
                      <Form.Control
                        as="select"
                        disabled={isAnteiligeFlaeche()}
                        style={{
                          background: fieldBackground(
                            crInfo.colors.anschlussgrad
                          ),
                        }}
                        value={crInfo.anschlussgrad?.grad_abkuerzung}
                        onChange={(e) => changeAnschlussgrad(e.target.value)}
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
                    )}
                    <Form.Control.Feedback type="invalid">
                      Bitte wählen Sie einen gültigen Anschlussgrad.
                    </Form.Control.Feedback>
                  </Form.Group>
                </Form>
              }
            />
          </div>
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
          {isPhone ? (
            <PhoneModalFooter
              hint="Belege nicht vergessen"
              details="Um unnötige Verzögerungen zu vermeiden, fügen Sie bei nachweispflichtigen Änderungen bitte die entsprechenden Belege hinzu."
              onCancel={cancel}
              onApply={close}
            />
          ) : (
            <>
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
                      <p>
                        Um unnötige Verzögerungen zu vermeiden, achten Sie bitte
                        darauf bei nachweispflichtigen Änderungen die
                        entsprechenden Belege hinzuzufügen.
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
            </>
          )}
        </Modal.Footer>
      </Modal>
    );
  } else {
    return null;
  }
};
export default CR00;
