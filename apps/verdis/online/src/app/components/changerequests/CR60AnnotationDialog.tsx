import React from "react";
import {
  Accordion,
  Button,
  Form,
  FormControl,
  FormGroup,
  Modal,
} from "react-bootstrap";
import { Icon } from "react-fa";
import Section from "react-cismap/topicmaps/menu/Section";

const Comp = () => {
  return (
    <Modal
      style={{
        zIndex: 3000000000,
      }}
      height="100%"
      show={true}
      onHide={close}
      keyboard={false}
    >
      <Modal.Header>
        <Modal.Title>
          <Icon name={"edit"} /> {`Anmerkung`}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body id="myMenu" key={"applicationMenuActiveKey"}>
        <p>
          Wenn Sie konkrete Änderungswünsche oder Anmerkungen haben, die Sie
          durch eine Geometrie veranschaulichen wollen, können Sie diese im
          untenstehenden Formular (blau umrahmter Bereich) eingeben. Bitte
          beachten Sie, dass Sie bestimmte Änderungswünsche mit Dokumenten
          belegen müssen.
        </p>
        <Section
          key={"sectionKey0"}
          sectionKey={"sectionKey"}
          style={{ marginBottom: 6 }}
          sectionBsStyle="info"
          sectionTitle={"Anmerkung "}
          sectionContent={
            <Form>
              <Form.Group controlId="subject">
                <Form.Label>Betreff</Form.Label>
                <Form.Control
                  type="text"
                  placeholder="Geben Sie hier den Titel Ihrer Anmerkung an"
                  // onChange={(e) => {
                  //   const newA = { ...annotationFeature, properties: { ...annotationFeature.properties } };
                  //   newA.properties.title = e.target.value;
                  //   newA.properties.draft = true;
                  //   setNewAnnotation(newA);
                  // }}
                  // value={annotationFeature?.properties?.title || ""}
                  value="12345"
                />
              </Form.Group>

              <Form.Group
                controlId="annotationText"
                className="customLeftAlignedValidation mt-3"
              >
                <Form.Label>Text</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={8}
                  // onChange={(e) => {
                  //   const newA = { ...annotationFeature, properties: { ...annotationFeature.properties } };
                  //   newA.properties.text = e.target.value;
                  //   newA.properties.draft = true;
                  //   setNewAnnotation(newA);
                  // }}
                  // value={annotationFeature?.properties?.text || ""}
                  value={"222222222"}
                />
              </Form.Group>
            </Form>
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
                <p>
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
          // bsStyle='warning'
          type="submit"
          // onClick={cancel}
        >
          Abbrechen
        </Button>
        <Button
          id="cmdCloseModalApplicationMenu"
          // bsStyle='primary'
          type="submit"
          onClick={close}
        >
          Übernehmen
        </Button>
      </Modal.Footer>
    </Modal>
  );
};
export default Comp;
