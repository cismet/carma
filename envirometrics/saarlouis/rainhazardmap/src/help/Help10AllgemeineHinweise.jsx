import React, { useContext } from "react";
import { UIDispatchContext } from "react-cismap/contexts/UIContextProvider";
import GenericModalMenuSection from "react-cismap/topicmaps/menu/Section";

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
          <p>
            Die Starkregengefahrenkarte der Stadt Saarlouis stellt einerseits
            die maximalen Wassertiefen anderseits die maximalen
            Fließgeschwindigkeiten im Stadtgebiet dar, die im Verlauf eines
            simuliertes Starkregenereignisses berechnet wurden. Über die
            Schaltfläche „maximale Wassertiefen“ bzw. „maximale
            Fließgeschwindigkeiten“ kann zwischen den beiden Ansichten
            gewechselt werden.
          </p>
          <p>
            Die simulierten Ergebnisse versuchen die Realität möglichst genau
            abzubilden, allerdings sind bei der Betrachtung und Interpretation
            der Ergebnisse die Datengrundlagen und -annahmen zu berücksichtigen.
            Hinweise zu den Datengrundlagen und zur Aussagekraft der Ergebnisse
            werden nachfolgend beschrieben.
          </p>

          <p>
            Das Ergebnis der Simulation ist von der Dauer und Intensität des
            Regens abhängig. Die dargestellten Szenarien zeigen
            Niederschlagsereignisse über einen Zeitraum von 1 Stunde mit
            unterschiedlichen Intensitäten. Die dargestellten Szenarien sind:
          </p>
          <p>
            <ul>
              <li>
                Stärke 6: Niederschlagsmenge: 46,8 l/m² (SRI 6); Statistische
                Wiederkehrzeit: 50 Jahre
              </li>
              <li>
                Stärke 7: Niederschlagsmenge: 52,3 l/m² (SRI 7); Statistische
                Wiederkehrzeit: 100 Jahre
              </li>
              <li>
                Stärke 10: Niederschlagsmenge: 68,0 l/m² (SRI 10); Extremer
                Starkregen: 1,3-fachen Niederschlagsmenge des SRI 7 Ereignisses
              </li>
            </ul>
            Die Simulationszeit beträgt 3 Stunden.
          </p>
          <p>
            Der Farbverlauf für die <strong>Wassertiefen</strong> nutzt die
            Eckwerte:
            <ul>
              <li>20 cm - hellblau </li>
              <li>40 cm - blau</li>
              <li>75 cm - dunkelblau</li>
              <li>&gt; 100 cm - violett</li>
            </ul>
            Wassertiefen unter 5 cm werden nicht mehr farbig ausgeprägt
            (transparente Darstellung).{" "}
          </p>
          <p>
            Zur Visualisierung der <strong>Fließgeschwindigkeiten</strong>,
            angegeben in Meter pro Sekunde (m/s), werden die folgende Eckwerte
            verwendet:
            <ul>
              <li>0,5 m/s - gelb</li>
              <li>1,0 m/s - orange</li>
              <li>2,0 m/s - hellrot</li>
              <li>4,0 m/s - dunkelrot</li>
            </ul>
            Der untere Grenzwert für die farbige Anzeige einer
            Fließgeschwindigkeit liegt bei 0,2 m/s.
          </p>
          <p>
            Zusätzlich zu den maximalen Wassertiefen und zu den maximalen
            Fließgeschwindigkeiten informiert die Starkregengefahrenkarte über
            das <strong>Gefährdungspotenzial der Gebäude</strong> in Saarlouis.
            Übersteigt der Wasserstand im Umkreis von 1 m um ein Gebäude die
            folgenden Werte werden die Gebäude entsprechend farblich
            dargestellt:
            <ul>
              <li>&lt; 0,25 m – schwarz</li>
              <li>0,5 m – gelb </li>
              <li>1,0 m – orange </li>
              <li>&gt; 1,0 m – rot</li>
            </ul>
          </p>

          <p>
            Die Starkregengefahrenkarte der Stadt Saarlouis wurde im Rahmen des
            Projektes STARK – Strategien und Anpassungsmaßnahmen zur Erhöhung
            der Resilienz gegenüber den Folgen des Klimawandels in der
            Kreisstadt Saarlouis – durch die IZES gGmbH erarbeitet. Das Projekt
            STARK wurde durch das Bundesministerium für Umwelt, Naturschutz,
            nukleare Sicherheit und Verbraucherschutz (BMUV) über die
            Förderrichtlinie "Maßnahmen zur Anpassung an die Folgen des
            Klimawandels" gefördert. Die Projektlaufzeit ist vom Oktober 2020
            bis Dezember 2023.
          </p>
          <p>
            Das Projekt STARK legt großen Wert auf die Einbindung aller am
            Prozess beteiligten Akteure sowie auf die Information,
            Sensibilisierung und Beratung der Bürgerinnen und Bürger Saarlouis.
            Daher wurde im Rahmen des Projektes diese Visualisierung der
            Starkregengefahrenkarte auf der Homepage der Stadt Saarlouis
            angestrebt. Finanziert wurde die Umsetzung dieser Visualisierung
            durch Fördermittel des Ministeriums für Umwelt, Klima, Mobilität,
            Agrar und Verbraucherschutz des Saarlandes im Rahmen der Richtlinie
            zur Förderung von Maßnahmen des Hochwasser- und
            Starkregenrisikomanagements.
          </p>
        </div>
      }
    />
  );
};
export default Component;
