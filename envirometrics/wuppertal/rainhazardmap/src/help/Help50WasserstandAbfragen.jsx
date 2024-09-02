import React, { useContext } from 'react';
import GenericModalMenuSection from 'react-cismap/topicmaps/menu/Section';
import Icon from 'react-cismap/commons/Icon';
import { UIDispatchContext } from 'react-cismap/contexts/UIContextProvider';
/* eslint-disable jsx-a11y/anchor-is-valid */

const Component = () => {
  const { setAppMenuActiveMenuSection } = useContext(UIDispatchContext);

  return (
    <GenericModalMenuSection
      sectionKey="wasserstand"
      sectionTitle="Wassertiefe oder Fließgeschwindigkeit abfragen"
      sectionBsStyle="success"
      sectionContent={
        <div>
          <p>
            Durch Anklicken der Schaltfläche <Icon name="crosshairs" /> oberhalb
            des Kontrollfelds aktivieren Sie ein Werkzeug zur zellbezogenen
            Abfrage von simulierten Wassertiefen bzw. Fließgeschwindigkeiten. Im
            Modus &quot;Maximalwerte&quot; können Sie hierüber je nach
            eingestellter Kartenansicht die maximale Wassertiefe bzw. die
            maximale Fließgeschwindigkeit abfragen, die in einer Rasterzelle im
            Verlauf der aktuell ausgewählten Simulation entsteht. Im Modus
            &quot;Zeitlicher Verlauf&quot; wird Ihnen dagegen als Ergebnis Ihrer
            Abfrage ein interaktives Diagramm präsentiert, das die Entwicklung
            der Wassertiefe bzw. Fließgeschwindigkeit über die gesamte
            Simulationsdauer darstellt.
          </p>

          <p>
            Zum Modus &quot;Maximalwerte&quot;: diese Werte sind im Verlauf
            jeder Simulation für eine jede 1m x 1m Rasterzelle berechnet worden.
            Anstelle der Schaltfläche erscheint hier das Anzeigefeld "Maximale
            Wassertiefe" bzw. "Maximale Fließgeschwindigkeit", zunächst mit
            einem kurzen Bedienungshinweis. Ein Klick auf eine beliebige
            Position in der Karte bewirkt jetzt, dass die Zelle in der Karte
            markiert und der zugehörige Maximalwert der Wassertiefe bzw. der
            Fließgeschwindigkeit in diesem Feld angezeigt wird. Die Anzeige der
            maximalen Wassertiefe wird dabei auf volle 10 cm gerundet (z. B.
            "ca. 90 cm"), um die{' '}
            <a onClick={() => setAppMenuActiveMenuSection('aussagekraft')}>
              beschränkte Aussagekraft der Simulationsergebnisse
            </a>{' '}
            zu verdeutlichen. Aus demselben Grund werden berechnete Wassertiefen
            von mehr als 150 cm nur als "&lt; 150 cm" angezeigt. Die Anzeige der
            maximalen Fließgeschwindigkeiten erfolgt in der Einheit "Meter pro
            Sekunde" (m/s), gerundet auf eine Nachkommastelle.
            Fließgeschwindigkeiten von mehr als 6 Meter pro Sekunde werden als
            "&lt; 6 m/s" angezeigt.
          </p>
          <p>
            <b>Tipp für die Abfrage der maximalen Fließgeschwindigkeiten:</b>{' '}
            Deaktivieren Sie die{' '}
            <a onClick={() => setAppMenuActiveMenuSection('karteninhalt')}>
              Animation
            </a>{' '}
            und stellen Sie einen sehr großen Betrachtungsmaßstab ein (Zoomstufe
            22). Dann wird Ihnen in der Kartendarstellung auch die zu der
            maximalen Fließgeschwindigkeit gehörende Fließrichtung zellenscharf
            angezeigt.
          </p>

          <p>
            Zum Modus &quot;Zeitlicher Verlauf&quot;: Das Diagramm zum
            zeitlichen Verlauf der zellbezogenen Wassertiefen bzw.
            Fließgeschwindigkeiten, das in diesem Modus anstelle der
            Maximalwerte angezeigt wird, ist bidirektional mit dem Time-Slider
            gekoppelt. Zum einen wird die aktuelle Position auf dem Zeitstrahl
            des Time-Sliders durch eine senkrechte Linie im Diagramm markiert.
            Bei einer automatischen oder interaktiven Bewegung auf dem
            Zeitstrahl bewegt sich diese Linie im Diagramm entsprechend. Zum
            anderen kann die Markierungslinie im Diagramm auch auf einen
            beliebigen 5-Minuten-Zeitschritt gesetzt werden (horizontales
            Bewegen der Maus bzw. Ziehen des Fingers im Diagramm zur Abfrage der
            einzelnen Datenpunkte, linker Mausklick bzw. einfaches Antippen zum
            Verschieben der Markierungslinie auf den Zeitschritt des aktuell
            angezeigten Datenpunktes). In diesem Fall werden die
            Positionsmarkierung auf dem Zeitstrahl und die Kartendarstellung
            entsprechend synchronisiert.
          </p>

          <p>
            Wenn Sie nach der Abfrage einer maximalen Wassertiefe oder
            Fließgeschwindigkeit bzw. eines Verlaufs von Wassertiefe oder
            Fließgeschwindigkeit eine andere Simulation auswählen, wird der
            angezeigte Zellwert automatisch aktualisiert. So können Sie für eine
            bestimmte Position bequem alle angebotenen Simulations-Szenarien
            durchgehen. Auch im Abfragemodus können Sie die Karte mit gedrückter
            linker Maustaste verschieben. Wenn Sie auf diese Weise oder durch{' '}
            <a onClick={() => setAppMenuActiveMenuSection('positionieren')}>
              Positionierung über einen Suchbegriff
            </a>{' '}
            einen Kartenausschnitt auswählen, in dem die zuletzt abgefragte
            Zelle nicht mehr enthalten ist, wird das Anzeigefeld auf seinen
            Startzustand zurückgesetzt. Mit einem Klick auf das{' '}
            <Icon name="close" /> Symbol rechts oben im Anzeigefeld beenden Sie
            den Abfragemodus.
          </p>
        </div>
      }
    />
  );
};
export default Component;
