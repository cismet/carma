import React, { useContext } from "react";
import { UIDispatchContext } from "react-cismap/contexts/UIContextProvider";
import GenericModalMenuSection from "react-cismap/topicmaps/menu/Section";
/* eslint-disable jsx-a11y/anchor-is-valid */

const Component = () => {
  const { setAppMenuActiveMenuSection } = useContext(UIDispatchContext);

  return (
    <GenericModalMenuSection
      sectionKey="aussagekraft"
      sectionTitle="Aussagekraft der Simulationen"
      sectionBsStyle="info"
      sectionContent={
        <div>
          <p>
            Unsere Starkregengefahrenkarte zeigt die Ergebnisse von
            Simulationen, die dem heutigen Stand der Technik entsprechen. Die
            Berechnungen basieren auf einem vereinfachten Modell der
            tatsächlichen Verhältnisse. Für eine noch differenziertere
            Modellierung fehlen zum einen die Daten, zum anderen ließe sich die
            automatisierte Berechnung nicht mehr in erlebbarer Zeit durchführen!{" "}
          </p>

          <p>
            Was sind die wichtigsten Vereinfachungen, die wir vornehmen mussten?
          </p>

          <ul>
            <li>
              Das abfließende Regenwasser findet in{" "}
              <strong>Kellergeschossen</strong>, die als sog.{" "}
              <strong>Retentionsräume</strong> wirken, ein Rückhaltevolumen, das
              wir nicht berücksichtigt haben. Hierzu fehlen uns die Daten. Es
              ist wegen der unbekannten Eintrittspunkte auch nicht modellierbar,
              in welche Kellergeschosse tatsächlich Wasser hineinlaufen würde!
            </li>

            <li>
              Teile des Regenwassers können in der Realität durch{" "}
              <strong>Verdunstung</strong> verschwinden. Diesen Effekt haben wir
              aus fachlichen Gründen bewusst vernachlässigt. Die Verdunstung
              spielt im Starkregenfall nur eine untergeordnete Rolle.
            </li>
          </ul>
          <p>
            In Version 2.1 der Simulationsberechnungen haben wir erstmalig den
            Effekt der <strong>Versickerung</strong> mit einem moderaten Ansatz
            berücksichtigt, um die mittleren Verhältnisse bei Starkregen
            abzubilden. Die dafür erforderlichen Daten zum Versiegelungsgrad der
            Oberfläche stammen aus dem Versiegelungsdaten-Informationssystem
            VerDIS der Stadtverwaltung Wuppertal und aus der sog.
            &quot;tatsächlichen Nutzung&quot; des
            Liegenschaftskataster-Fachverfahrens ALKIS. Es gibt keine
            Möglichkeit, die Versickerung allgemeingültig und passend für alle
            Fragestellungen zu modellieren, auch weil sie bei einem
            tatsächlichen Starkregenereignis wesentlich vom
            Niederschlagsgeschehen in dessen Vorfeld abhängt. Im schlimmsten
            anzunehmenden Fall ist der Boden bereits vollständig mit Wasser
            gesättigt oder an der Oberfläche vollständig ausgetrocknet. In
            beiden Fällen würde es nicht zu einer relevanten Versickerung
            kommen. Dieses Worst-Case-Szenario, das wir bei vorherigen
            Simulationen bis einschließlich Version 2.0 angenommen haben, geben
            wir jetzt zugunsten eines wahrscheinlicheren Geschehens auf, bei dem
            doch ein gewisser Teil des Regenwassers versickert. Dieser Anteil
            kann damit nicht mehr zu Überflutungen auf der Geländeoberfläche
            beitragen. Ein wichtiger Grund für die Änderung unseres Ansatzes war
            die bessere Vergleichbarkeit unserer Simulationen mit entsprechenden
            Berechnungen für andere Städte. Wenn eine Stadt ein großes
            &quot;grünes&quot; Wassereinzugsgebiet hat, also z. B. höher
            gelegene Waldflächen, führt eine Vernachlässigung der Versickerung
            zu deutlich unrealistischen Wassertiefen in den
            Simulationsergebnissen. Daher berücksichtigt die Dr. Pecher AG,
            unser Entwicklungspartner für die Simulationsberechnungen,
            mittlerweile immer auch einen Lastfall mit Versickerungseffekt in
            ihren Simulationsergebnissen.
          </p>
          <p>
            <strong>
              Auch mit dem Versickerungsansatz bleibt eine Tendenz zur lokalen
              Überzeichnung der Wassertiefen, die sich bei einem realen Regen
              der angenommenen Stärke einstellen würden, bestehen.
            </strong>{" "}
            Um diesem Umstand Rechnung zu tragen, geben wir bei der{" "}
            <a
              class="renderAsLink"
              onClick={() => setAppMenuActiveMenuSection("wasserstand")}
            >
              Abfrage der Wassertiefe oder der Fließgeschwindigkeit
            </a>{" "}
            ab einer berechneten Wassertiefe von 150 cm nur noch "größer als 150
            cm" ({">"} 150 cm) und ab einer berechneten Fließgeschwindigkeit von
            6 m/s nur noch "{">"} 6 m/s" als Ergebnis an.
          </p>

          <p>
            Außerdem konnten wir die Wirkung des Kanalnetzes, das einen Teil des
            Starkregens abführt, nur vereinfacht modellieren. Hierdurch kann es
            zu Abweichungen zwischen den Simulationsergebnissen und den
            Überflutungen durch ein reales Regenereignis kommen.
          </p>

          <p>
            Auch das Digitale Geländemodell (DGM), das für die Simulationen als
            Grundlage dient, kann Fehler aufweisen. Helfen Sie uns dabei, das
            DGM sukzessive zu verbessern, indem Sie uns vermutete{" "}
            <a
              class="renderAsLink"
              onClick={() => setAppMenuActiveMenuSection("modellfehlermelden")}
            >
              Fehler im Geländemodell melden
            </a>
            ! Zuletzt kann es sein, dass ein bestehendes Gebäude in den
            Simulationen nicht berücksichtigt wurde, weil es zum Zeitpunkt der
            Datenbereitstellung für die Simulationsberechnungen noch nicht im
            Liegenschaftskataster nachgewiesen war.
          </p>
        </div>
      }
    />
  );
};
export default Component;
