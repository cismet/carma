import React, { useContext } from "react";
import { UIDispatchContext } from "react-cismap/contexts/UIContextProvider";
import GenericModalMenuSection from "react-cismap/topicmaps/menu/Section";
import izesLogo from "./assets/IZESgGmbH_logo.png";
import konnekt from "./assets/konnekt-logo.png";
import bmbf from "./assets/bmbf.png";
import regioninnovativ from "./assets/REGIONinnovativ.png";

/* eslint-disable jsx-a11y/anchor-is-valid */

const Component = () => {
  const { setAppMenuActiveMenuSection } = useContext(UIDispatchContext);

  return (
    <GenericModalMenuSection
      sectionKey="allgemeineHinweise"
      sectionTitle="Allgemeine Hinweise"
      sectionBsStyle="warning"
      sectionContent={
        <div>
          <h4>Solarkataster Saarlouis Innenstadt und Nalbach Bilsdorf</h4>
          <img
            style={{ width: 260, float: "right", padding: 30, maxWidth: "50%" }}
            src={konnekt}
            alt="Konnekt"
          />
          <p>
            Das Ziel des Solardachkatasters ist es, allen interessierten
            Bürgerinnen und Bürgern die Möglichkeit zu bieten, das Potenzial
            ihrer eigenen Dächer für die Installation von Photovoltaikanlagen zu
            erkennen. Auf diese Weise soll ein aktiver Beitrag zur Steigerung
            der Zubauquote von Solaranlagen in den beiden Regionen geleistet
            werden. Durch die Nutzung des Solarkatasters erhalten die
            Bürgerinnen und Bürger wertvolle Informationen und eine fundierte
            Entscheidungsgrundlage, um die Umsetzung von nachhaltigen
            Energielösungen zu fördern und den Übergang zu erneuerbaren Energien
            zu unterstützen. Das Solarkataster hilft dabei, folgende
            wesentlichen Fragen zu beantworten:
          </p>
          <p>
            <ul>
              <li>
                Sind die Dachflächen meines Gebäudes hinsichtlich Ausrichtung,
                Neigung und potenzieller Abschattungen überhaupt für die Nutzung
                von Solarenergie geeignet?
              </li>
              <li>Wie viel Energie kann meine Immobilie mit einer erzeugen?</li>
            </ul>
          </p>
          <p>
            Mit diesen Informationen können Bürgerinnen und Bürger fundierte
            Entscheidungen treffen, wie sie zur Energiewende beitragen und
            gleichzeitig von den Vorteilen der Solarenergie profitieren können.
          </p>
          <p>
            Das Solardachkataster stellt das Potenzial an Solarenergie in
            Saarlouis Innenstadt und Nalbach Bilsdorf von niedrig (gelb) bis
            sehr hoch (rot) dar.
          </p>
          <p>
            Das Solardachkataster wurde durch die IZES gGmbH im Rahmen des
            Forschungsprojektes Konnekt des Bundesministeriums für Bildung und
            Forschung erstellt.
          </p>

          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: 32,
              marginTop: 40,
            }}
          >
            <img style={{ height: 90 }} src={izesLogo} alt="IZES" />
            <img style={{ height: 90 }} src={bmbf} alt="BMBF" />
            <img
              style={{ height: 90 }}
              src={regioninnovativ}
              alt="REGIONinnovativ"
            />
          </div>
        </div>
      }
    />
  );
};
export default Component;
