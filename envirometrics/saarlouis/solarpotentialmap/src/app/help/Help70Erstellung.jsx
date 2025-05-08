import React, { useContext } from "react";
import { UIDispatchContext } from "react-cismap/contexts/UIContextProvider";
import GenericModalMenuSection from "react-cismap/topicmaps/menu/Section";

/* eslint-disable jsx-a11y/anchor-is-valid */

const Component = () => {
  const { setAppMenuActiveMenuSection } = useContext(UIDispatchContext);

  return (
    <GenericModalMenuSection
      sectionKey="aussagekraft"
      sectionTitle="Erstellung eines Solarkatasters"
      sectionBsStyle="info"
      sectionContent={
        <div>
          <h5>1. Datengrundlage</h5>
          <div style={{ marginLeft: 24 }}>
            <p>
              Die Grundlage für die Berechnung eines Solarkatasters bildet ein
              Digitales Oberflächenmodell (DOM). Ein DOM ist eine punktuelle,
              flugzeuggestützte Erfassung der Erdoberfläche, die dreidimensional
              abgebildet wird. Es enthält alle auf der Erdoberfläche
              befindlichen Objekte zum Zeitpunkt der Aufnahme, wie Gelände,
              Bäume, Gebäude und Laternen. Die Auflösung des DOM beträgt 25 x 25
              cm.
            </p>
          </div>

          <h5>2. Solarpotenzialberechnung</h5>
          <div style={{ marginLeft: 24 }}>
            <p>
              Bei der Solarpotenzialberechnung werden vier entscheidende
              Faktoren berücksichtigt:
            </p>
            <ul>
              <li>
                <strong>Exposition:</strong> Die optimale Ausrichtung eines
                Daches ist in Deutschland identisch: Eine Südausrichtung
                verspricht die höchsten Erträge. Mit der zunehmenden Bedeutung
                des Eigenverbrauchs gewinnen jedoch auch Dachflächen in West-
                und Ostausrichtung zunehmend an Bedeutung.
              </li>
              <li>
                <strong>Neigung:</strong> Der ideale Neigungswinkel für ein Dach
                liegt im Saarland bei etwa 30°. Die Kategorisierung der Neigung
                berücksichtigt daher die geographische Breite des jeweiligen
                Gebiets.
              </li>
              <li>
                <strong>Globalstrahlung/Sonnenstand:</strong> Die Berechnungen
                der Einstrahlung erfolgen mit einer hohen Auflösung von Minuten
                und basieren auf Globalstrahlungsdaten. Zusätzlich wird ein
                Faktor einbezogen, der die Streu- und Absorptionsverluste in der
                Erdatmosphäre beschreibt. Das Modell unterscheidet die direkte
                und diffuse Einstrahlung, um die genaue Energieaufnahme des
                Daches zu simulieren.
              </li>
              <li>
                <strong>Verschattung:</strong> Verschattung durch Bäume,
                benachbarte Gebäude oder entfernte Geländeerhebungen kann die
                Erträge einer Photovoltaikanlage erheblich beeinträchtigen.
                Daher berücksichtigt das Solarkataster diese
                Verschattungseffekte im Rahmen der Einstrahlungsberechnungen
                über das gesamte Jahr hinweg.
              </li>
            </ul>
          </div>

          <h5>3. Gebäudeerkennung</h5>
          <div style={{ marginLeft: 24 }}>
            <p>
              Basierend auf dem Oberflächenmodell und der
              Solarpotenzialermittlung je Rasterpunkt werden mit Hilfe amtlicher
              Gebäudegrundrisse zunächst alle Gebäude im jeweiligen Gebiet
              identifiziert. Im nächsten Schritt erfolgt dann die Übertragung
              des Solarpotenzials der einzelnen Rasterpunkte auf die einzelnen
              Gebäude.
            </p>
          </div>
          <p>
            Die Ergebnisse dieser Berechnungen werden im Solarkataster
            übersichtlich in vier Klassen von niedrigem Solarpotenzial in Gelb
            bis zu sehr hohem Solarpotenzial in Rot dargestellt. Das Potenzial
            bezieht sich auf den Ertrag durch Photovoltaikanlagen und wird auf
            die Dachfläche und auf ein Jahr bezogen angegeben.
          </p>

          <p>
            Durch Klicken auf eine Gebäude wird das Solarpotenzial in MWh/ Jahr
            des jeweiligen Gebäudes angegeben.
          </p>
        </div>
      }
    />
  );
};
export default Component;
