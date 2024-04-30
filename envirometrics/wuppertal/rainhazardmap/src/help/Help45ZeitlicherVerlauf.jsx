import React from "react";
import GenericModalMenuSection from "react-cismap/topicmaps/menu/Section";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner, faPlay, faStop } from "@fortawesome/free-solid-svg-icons";

const Component = () => {
  return (
    <GenericModalMenuSection
      sectionKey="zetlicherverlauf"
      sectionTitle="Zeitlicher Verlauf"
      sectionBsStyle="success"
      sectionContent={
        <div>
          <p>
            Im Modus &quot;Zeitlicher Verlauf&quot; erscheint in der Titelzeile
            unterhalb der aktuellen Kartenbezeichnung ein Steuerelement
            (&quot;Time-Slider&quot;), mit dem Sie sich im zweistündigen
            Zeitintervall unserer Simulationen bewegen können. Hierzu wurden bei
            den Simulationsberechnungen auch die Zwischenzustände (Wassertiefen
            und Fließgeschwindigkeiten) in Zeitschritten von 5 Minuten
            festgehalten. Für jede Simulation gibt es damit je 24 zeitlich
            gestaffelte Kartenebenen für die Wassertiefen und die
            Fließgeschwindigkeiten. Beim ersten Aktivieren des Modus
            &quot;Zeitlicher Verlauf&quot; werden diese 24 Kartenebenen zunächst
            geladen, was Sie an der dünnen, blauen Ladefortschrittsanzeige an
            der Unterkante der Titelzeile und dem animierten Loading-Symbol{" "}
            <FontAwesomeIcon icon={faSpinner} /> rechts neben dem Time-Slider
            erkennen. Nach jeder Veränderung des Kartenausschnittes müssen die
            24 Kartenebenen erneut geladen werden, es kommt dadurch also immer
            zu einer kleinen Verzögerung in der Benutzung der Anwendung.
          </p>
          <p>
            Der Time-Slider unterstützt eine automatische und eine interaktive
            Visualisierung. Die automatische Visualisierung lösen Sie durch
            Anklicken der Schaltfläche &quot;Simulation starten&quot;{" "}
            <FontAwesomeIcon icon={faPlay} /> rechts neben dem Time-Slider aus.
            Die Simulation wird dann als Trickfilm in einer Endlosschleife über
            das gesamte Zeitintervall der Simulation angezeigt (mit
            Überblendungen zwischen den 24 Zwischenzuständen). Während der
            Trickfilm läuft, wird anstelle der Schaltfläche &quot;Simulation
            starten&quot; die Schaltfläche &quot;Simulation stoppen&quot;{" "}
            <FontAwesomeIcon icon={faStop} /> angeboten, mit der Sie die
            Simulationsanzeige jederzeit unterbrechen können. Durch erneutes
            Anklicken der Schaltfläche (jetzt wieder als &quot;Simulation
            starten&quot;) können Sie die Simulation fortsetzen. Wenn Sie
            während einer laufenden Simulationsanzeige den Kartenausschnitt
            verändern (z. B. durch Verschieben), wird die Simulation automatisch
            unterbrochen, damit die Kartenebenen für den neuen Ausschnitt
            geladen werden können. Zur Fortsetzung der Simulation zum Zeitpunkt
            der Unterbrechung, nun aber im neuen Kartenausschnitt, müssen Sie
            erneut die Schaltfläche &quot;Simulation starten&quot; anklicken.
          </p>
          <p>
            Für die interaktive Visualisierung können sie den grauen Balken des
            Time-Sliders (&quot;Zeitstrahl&quot;), der das gesamte Zeitintervall
            der Simulation repräsentiert, an einer beliebigen Stelle anklicken.
            Es wird dann der nächstgelegene 5-Minuten-Zeitschritt
            &quot;eingefangen&quot; und in der Karte dargestellt (keine
            Überblendungen). Alternativ können Sie die kreisförmige Markierung,
            die den aktuell angezeigten Zeitpunkt auf dem Zeitstrahl markiert,
            mit gedrückter linker Maustaste (bei Geräten mit Touch-Display durch
            einfaches Ziehen) auf dem Zeitstrahl bewegen, in beide Richtungen
            und im Tempo Ihrer Wahl (mit Überblendungen). Beide Möglichkeiten
            zur interaktiven Bedienung sind auch nach der Unterbrechung einer
            automatischen Simulationsanzeige oder in einer laufenden Simulation,
            die dadurch nicht unterbrochen wird, gegeben.
          </p>
        </div>
      }
    />
  );
};
export default Component;
