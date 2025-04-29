import Color from "color";
import React, { useState } from "react";
import { Button, FormControl, FormGroup, Modal } from "react-bootstrap";
import Section from "react-cismap/topicmaps/menu/Section";

import { Icon } from "react-fa";
// import {
//     anschlussgrade,
//     flaechenarten,
//     getOverlayTextForFlaeche,
//     getProcessedFlaechenCR,
//     needsProof,
//     needsProofSingleFlaeche
// } from "../../utils/kassenzeichenHelper";
import FlaechenPanel from "../FlaechenPanel";
import DocPanel from "./CR20DocumentsPanel";

const CR00 = ({
  visible,
  //   height,
  showChangeRequestMenu = () => {},
  flaeche = {},
  flaechenCR = {},
  setFlaechenCR = () => {},
  documents = [],
  uploadCRDoc = () => {},
  addFiles = () => {},
  localErrorMessages = [],
  addLocalErrorMessage = () => {},
}) => {
  const [tmpAttachments, setTmpAttachments] = useState([]);
  const modalBodyStyle = {
    overflowY: "auto",
    overflowX: "hidden",
    // maxHeight: height - 200,
  };
  const close = () => {
    // if (tmpAttachments.length > 0) {
    //     addFiles(tmpAttachments);
    //     setTmpAttachments([]);
    // }
    // if (JSON.stringify(flaechenCR) !== "{}") {
    //     showChangeRequestMenu(true);
    // } else {
    //     showChangeRequestMenu(false);
    // }
  };
  const cancel = () => {
    // setTmpAttachments([]);
    // showChangeRequestMenu(false);
  };

  // const proofNeeded =
  //     needsProofSingleFlaeche(flaechenCR) &&
  //     documents?.length === 0 &&
  //     tmpAttachments.length === 0;

  // const setNewFlaechenCR = cr => {
  //     cr.draft = true;
  //     setFlaechenCR(cr);
  // };

  // const isAnteiligeFlaeche = () => {
  //     return flaeche.anteil !== undefined && flaeche.anteil !== null;
  // };

  if (visible !== false) {
    // const crInfo = getProcessedFlaechenCR(flaeche, flaechenCR);

    return (
      <Modal
        style={{
          zIndex: 3000000000,
        }}
        height="100%"
        // show={true || visible}
        show={true}
        onHide={cancel}
        keyboard={false}
      >
        <Modal.Header>
          <Modal.Title>
            <Icon name={"edit"} />{" "}
            {/* {`Änderungen an ${flaeche.flaecheninfo.flaechenart.art} ${flaeche.flaechenbezeichnung}`} */}
            {`Änderungen an`}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body
          //   style={modalBodyStyle}
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
            sectionKey={"sectionKey"}
            style={{ marginBottom: 6 }}
            // defaultActiveKey={"sectionKey0"}
            sectionTitle={"Übersicht "}
            sectionContent={
              <div>
                <div>
                  <h4>aktueller Datenbestand</h4>
                  {/* <FlaechenPanel flaeche={flaeche} /> */}
                </div>
              </div>
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
