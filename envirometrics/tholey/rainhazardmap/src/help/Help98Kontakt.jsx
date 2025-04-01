import React from "react";
import GenericModalMenuSection from "react-cismap/topicmaps/menu/Section";
import cismetLogo from "./assets/cismetSignet2k.png";
import izesLogo from "./assets/IZES-Logo-hoch.jpg";

import customerLogo from "./assets/tholey.png";
/* eslint-disable jsx-a11y/anchor-is-valid */

const Component = ({ email }) => {
  return (
    <GenericModalMenuSection
      sectionKey="kontakt"
      sectionTitle="Kontakt"
      sectionBsStyle="warning"
      sectionContent={
        <div>
          <p>
            Für telefonische Auskünfte zum Umgang mit der
            Starkregengefahrenkarte der Gemeinde Tholey, stehen Ihnen die
            Mitarbeiter und Mitarbeiterinnen der Gemeinde Tholey zur Verfügung.
          </p>

          <p style={{ display: "flex" }}>
            <div>
              Gemeinde Tholey
              <br />
              Fachbereich Bauen, Wohnen, Umwelt
              <br />
              Im Kloster 1
              <br />
              66636 Tholey
              <br />
              Telefon:(06853) 508-0
              <br />
              E-Mail: <a href="mailto:{email)}">{email}</a>
              <br />
            </div>
            <img
              style={{ marginBottom: 10, marginLeft: 20, height: 150 }}
              target="_contacts"
              alt="Logo Auftraggeber"
              src={customerLogo}
            />
          </p>

          <table width="100%" style={{ marginTop: 50 }}>
            <tbody>
              <tr>
                <td style={{ textAlign: "left", paddingBottom: 20 }}>
                  <strong>Simulationsberechnungen</strong>
                </td>
                <td style={{ textAlign: "left", paddingBottom: 20 }}>
                  <strong>Visualisierung und technische Umsetzung</strong>
                </td>
              </tr>
              <tr>
                <td style={{ textAlign: "left", paddingBottom: 20 }}>
                  <img
                    target="_contacts"
                    alt="Logo izes"
                    src={izesLogo}
                    style={{ height: 80 }}
                  />
                </td>
                <td style={{ textAlign: "left", paddingBottom: 20 }}>
                  <img
                    target="_contacts"
                    alt="Logo cismet GmbH"
                    style={{ height: 40 }}
                    src={cismetLogo}
                  />
                </td>
              </tr>
              <tr>
                <td style={{ verticalAlign: "bottom" }}>
                  izes gGmbH
                  <br />
                  Altenkesseler Straße 17, Geb. A1
                  <br />
                  66115 Saarbrücken
                  <br />
                  Telefon: +49 681 - 844 972-0
                  <br />
                  E-Mail: <a href="mailto:izes@izes.de">izes@izes.de</a>
                </td>
                <td style={{ verticalAlign: "bottom" }}>
                  cismet GmbH
                  <br />
                  <br />
                  Tholey ▪️ Saarbrücken <br />
                  Telefon: 0681 965 901-20
                  <br />
                  <a href="https://cismet.de/" title={"and it just works"}>
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
