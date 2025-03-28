import React from "react";
import GenericModalMenuSection from "react-cismap/topicmaps/menu/Section";
import cismetLogo from "./assets/cismetSignet2k.png";
import swecoLogo from "./assets/sweco.png";
import customerLogo from "./assets/Logo_SWH_Mir_fuer_Uech.png";
/* eslint-disable jsx-a11y/anchor-is-valid */

const Component = ({ email }) => {
  return (
    <GenericModalMenuSection
      sectionKey="kontakt"
      sectionTitle="Kontakt"
      sectionBsStyle="warning"
      sectionContent={
        <div>
          <p style={{ display: "flex" }}>
            <div>
              Stadtwerke Hürth AöR
              <br />
              <br />
              Friedrich-Ebert-Straße 40
              <br />
              50354 Hürth
              <br />
              Telefon: (02233) - 53614
              <br />
              E-Mail: <a href="mailto:{email)}">{email}</a>
              <br />
            </div>
            <img
              style={{ marginBottom: 10, marginLeft: 20, height: "150px" }}
              target="_contacts"
              alt="Logo Auftraggeber"
              height="150"
              src={customerLogo}
            />
          </p>

          <table width="100%" style={{ marginTop: 50 }}>
            <tbody>
              <tr>
                <td style={{ textAlign: "left", paddingBottom: 20 }}>
                  <strong>Bearbeitung des Starkregenrisikomanagement</strong>
                </td>
                <td style={{ textAlign: "left", paddingBottom: 20 }}>
                  <strong>
                    Aufbau und Bereitstellung der Starkregengefahrenkarte
                  </strong>
                </td>
              </tr>
              <tr>
                <td style={{ textAlign: "left", paddingBottom: 20 }}>
                  <img
                    target="_contacts"
                    alt="Logo Pecher AG"
                    style={{ height: "55px" }}
                    src={swecoLogo}
                  />
                </td>
                <td style={{ textAlign: "left", paddingBottom: 20 }}>
                  <img
                    target="_contacts"
                    alt="Logo cismet GmbH"
                    style={{ height: "40px" }}
                    src={cismetLogo}
                  />
                </td>
              </tr>
              <tr>
                <td style={{ verticalAlign: "bottom" }}>
                  Sweco GmbH
                  <br />
                  Graeffstr. 5<br />
                  50823 Köln
                  <br />
                  Telefon: 0221 574020
                  <br />
                  E-Mail:{" "}
                  <a href="mailto:info@sweco-gmbh.de">info@sweco-gmbh.de</a>
                </td>
                <td style={{ verticalAlign: "bottom" }}>
                  cismet GmbH
                  <br />
                  <br />
                  Tholey ▪️ Saarbrücken <br />
                  Telefon: 0681 965 901-20
                  <br />
                  <a href="https://cismet.de/" title={"... one step ahead"}>
                    https://cismet.de/
                  </a>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      }
    />
  );
};
export default Component;
