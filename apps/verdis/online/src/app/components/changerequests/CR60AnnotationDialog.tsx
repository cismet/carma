import { Button, Form, Modal } from "react-bootstrap";
import { Icon } from "react-fa";
import Section from "react-cismap/topicmaps/menu/Section";
import { useSelector } from "react-redux";
import { getUiState } from "../../../store/slices/ui";
import "./CR00MainComponent.css";
import { phoneTitleStyle } from "./phoneModalStyles";
import PhoneModalFooter from "./PhoneModalFooter";
import PhoneCloseButton from "./PhoneCloseButton";
import ExpandableHint from "./ExpandableHint";
import { usePhoneVisualViewport } from "./usePhoneVisualViewport";

const introText =
  "Wenn Sie konkrete Änderungswünsche oder Anmerkungen haben, die Sie durch eine Geometrie veranschaulichen wollen, können Sie diese im untenstehenden Formular (blau umrahmter Bereich) eingeben. Bitte beachten Sie, dass Sie bestimmte Änderungswünsche mit Dokumenten belegen müssen.";

const Comp = ({
  visible,
  annotationFeature,
  deleteAnnotation,
  setNewAnnotation,
  showAnnotationEditView,
}) => {
  const isPhone = useSelector(getUiState).width < 768;
  usePhoneVisualViewport(isPhone && visible !== false);
  const closeHandler = () => {
    showAnnotationEditView(true);
  };

  const cancelHandler = () => {
    showAnnotationEditView(false);
  };

  if (visible !== false) {
    return (
      <Modal
        style={{
          zIndex: 3000000000,
        }}
        height="100%"
        show={visible}
        size="lg"
        onHide={close}
        keyboard={false}
        dialogClassName={isPhone ? "cr-modal-phone" : undefined}
      >
        <Modal.Header>
          <Modal.Title style={phoneTitleStyle(isPhone)}>
            <Icon name={"edit"} style={{ flexShrink: 0 }} />{" "}
            <span>{`Anmerkung ${annotationFeature.properties.name}`}</span>
          </Modal.Title>
          {isPhone && <PhoneCloseButton onClick={cancelHandler} />}
        </Modal.Header>
        <Modal.Body
          id="myMenu"
          key={"applicationMenuActiveKey"}
          style={
            isPhone ? { overflowY: "auto", fontSize: "0.95rem" } : undefined
          }
        >
          {isPhone ? (
            <ExpandableHint
              icon="ℹ"
              hint="Anmerkung eintragen und mit Dokumenten belegen"
              details={introText}
              style={{ marginBottom: 10 }}
            />
          ) : (
            <p>{introText}</p>
          )}
          <Section
            key={"sectionKey0"}
            sectionKey={"sectionKey0"}
            style={{ marginBottom: 6 }}
            sectionBsStyle="info"
            sectionTitle={"Anmerkung "}
            activeSectionKey={"sectionKey0"}
            setActiveSectionKey={() => {}}
            sectionContent={
              <Form onSubmit={(e) => e.preventDefault()}>
                <Form.Group controlId="subject" data-cr-focus-anchor="start">
                  <Form.Label>Betreff</Form.Label>
                  <Form.Control
                    type="text"
                    placeholder="Geben Sie hier den Titel Ihrer Anmerkung an"
                    onChange={(e) => {
                      const newA = JSON.parse(
                        JSON.stringify(annotationFeature)
                      );
                      newA.properties.title = e.target.value;
                      newA.properties.draft = true;
                      setNewAnnotation(newA);
                    }}
                    value={annotationFeature?.properties?.title || ""}
                  />
                </Form.Group>

                <Form.Group
                  controlId="annotationText"
                  className="customLeftAlignedValidation mt-3"
                  data-cr-focus-anchor="start"
                >
                  <Form.Label>Text</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={isPhone ? 5 : 8}
                    onChange={(e) => {
                      const newA = {
                        ...annotationFeature,
                        properties: { ...annotationFeature.properties },
                      };
                      newA.properties.text = e.target.value;
                      newA.properties.draft = true;
                      setNewAnnotation(newA);
                    }}
                    value={annotationFeature?.properties?.text || ""}
                  />
                </Form.Group>
                <Button
                  id="cmdCloseModalApplicationMenu"
                  variant="danger"
                  type="button"
                  className={isPhone ? "w-100 mt-3" : undefined}
                  onClick={deleteAnnotation}
                >
                  Anmerkung entfernen
                </Button>
              </Form>
            }
          />
        </Modal.Body>

        <Modal.Footer>
          {isPhone ? (
            <PhoneModalFooter
              hint="Belege nicht vergessen"
              details="Um unnötige Verzögerungen zu vermeiden, fügen Sie bei nachweispflichtigen Änderungen bitte die entsprechenden Belege hinzu."
              onCancel={cancelHandler}
              onApply={closeHandler}
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
                onClick={cancelHandler}
              >
                Abbrechen
              </Button>
              <Button
                id="cmdCloseModalApplicationMenu"
                variant="primary"
                type="submit"
                onClick={closeHandler}
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
export default Comp;
