import React, { useContext } from "react";
import Icon from "react-cismap/commons/Icon";
import { UIDispatchContext } from "react-cismap/contexts/UIContextProvider";
import GenericModalMenuSection from "react-cismap/topicmaps/menu/Section";

/* eslint-disable jsx-a11y/anchor-is-valid */

const Component = () => {
  const { setAppMenuActiveMenuSection } = useContext(UIDispatchContext);

  return (
    <GenericModalMenuSection
      sectionKey="karteninhalt"
      sectionTitle="Karteninhalt auswählen"
      sectionBsStyle="success"
      sectionContent={
        <div>
          <p>
            Die Starkregengefahrenkarte unterstützt drei verschiedene
            Kartenansichten. In der stets sichtbaren Titelzeile oben im
            Kartenfenster wird Ihnen die gerade aktive Kartenansicht angezeigt.
            Standardmäßig werden die maximalen Wassertiefen dargestellt, die im
            gesamten Verlauf eines simulierten Starkregenereignisses auftreten.
            Mit der Schaltfläche{" "}
            <a>
              <Icon name="random" />
            </a>{" "}
            auf der rechten Seite der Titelzeile können Sie zur Anzeige der
            maximalen Fließgeschwindigkeiten wechseln. (Ein erneuter Klick führt
            wieder zurück zur Anzeige der maximalen Wassertiefen.)
          </p>
          <p>
            In der rechten unteren Ecke der Anwendung (bei kleinen Displays
            unten direkt über dem Eingabefeld) finden Sie das{" "}
            <b>Kontrollfeld</b>, mit dem Sie den weiteren Karteninhalt nach
            Ihren Wünschen festlegen können. Klicken Sie unter <b>Simulation</b>{" "}
            auf eine der 3 Schaltflächen, um die Starkregensimulation
            auszuwählen, die angezeigt werden soll (Stärke 6, Stärke 7, Stärke
            10, Aus). Hier können Sie auch die Ebene mit den Gebäudegefährdungen
            ein- und ausblenden. Die Details zu den Simulationsberechnungen
            finden Sie hier in der Kompaktanleitung unter{" "}
            <a
              className="renderAsLink"
              onClick={() => setAppMenuActiveMenuSection("datengrundlage")}
            >
              Datengrundlagen
            </a>{" "}
            und{" "}
            <a
              className="renderAsLink"
              onClick={() => setAppMenuActiveMenuSection("szenarien")}
            >
              Simulierte Szenarien
            </a>
            .
          </p>
          <p>
            Unter <b>Karte</b> können Sie aus drei verschiedenen
            Hintergrundkarten auswählen: zwei unterschiedlichen Stadtplänen
            (grau/farbig) und einer Luftbildkarte. Ein Stadtplan eignet sich gut
            zur Orientierung anhand von Straßen. Die Luftbildkarte stellt eine
            anschauliche Grundlage dar. Sie eignet sich daher vor allem für die
            Darstellung räumlicher Zusammenhänge und Nutzungen. Da die
            Hintergrundkartendienste immer wieder aktualisiert werden, kann es
            in Einzelfällen zu geringen Abweichungen zu der Datengrundlage des
            Simualtionsmodells kommen, bis dieses ebenfalls mit den neuen
            Gebäuden/Objekten fortgeschrieben wird. Näheres zu den Geodaten, die
            diesen Karten zu Grunde liegen, finden Sie ebenfalls unter{" "}
            <a onClick={() => setAppMenuActiveMenuSection("datengrundlage")}>
              Datengrundlagen
            </a>
            .
          </p>
          <p>
            Unter <b>Animation</b> finden Sie einen Wechselschalter zum An- und
            Ausschalten einer animierten Darstellung des Fließgeschehens
            (Strömungsdarstellung). Standardmäßig ist diese Animation aktiviert.
            Sie basiert auf den Maximalbeträgen der Geschwindigkeitsvektoren,
            die für jede 1x1 m-Rasterzelle im Verlauf einer
            Simulationsberechnung bestimmt wurden. Es wird der Abfluss in die
            Richtung animiert, in der sich die größte Geschwindigkeit einstellt.
            Die Animation vermittelt ein besonders anschauliches Bild des
            komplexen Abflussgeschehens bei einem Starkregenereignis. Die
            Animation steht nur bei der Betrachtung der Starkregengefahrenkarte
            in einem Detailmaßstab (Zoomstufen 17 bis 22) zur Verfügung, in den
            Übersichtsmaßstäben (Zoomstufen 16 und kleiner) wird sie automatisch
            ausgeblendet. Die Animation wird für jede Kartenansicht neu online
            berechnet, sodass die Anzeigegeschwindigkeit von der
            Internetübertragung abhängt. Wenn die Animation nicht angezeigt
            wird, blenden wir in der Kartenansicht "max. Fließgeschwindigkeiten"
            in Detailmaßstäben (hier bis zur Zoomstufe 15) statische
            Fließrichtungspfeile ein, um die Hauptrichtungen des
            Regenwasserabflusses zu visualisieren.
          </p>
          <p>
            Am oberen Rand des Kontrollfeldes befindet sich eine platzsparende
            Legende, mit der die zur Klassifizierung der maximalen simulierten
            Wassertiefen bzw. Fließgeschwindigkeiten verwendeten Farben
            erläutert werden. Direkt darunter finden Sie die Bezeichnung und (in
            kleiner Schrift) eine Kurzbeschreibung des Simulationsszenarios.
            Über den Link{" "}
            <a onClick={() => setAppMenuActiveMenuSection("szenarien")}>
              (mehr)
            </a>{" "}
            am Ende jeder Kurzbeschreibung gelangen Sie zu einer ausführlicheren
            Darstellung aller Szenarien in der Kompaktanleitung. Mit der
            Schaltfläche <Icon name="chevron-circle-down" /> rechts neben der
            Simulationsbezeichnung lässt sich das Kontrollfeld so verkleinern,
            dass nur noch die Legende und die Simulationsbezeichnung angezeigt
            werden - nützlich für mobile Endgeräte mit kleinem Display. Mit der
            Schaltfläche <Icon name="chevron-circle-up" /> können Sie das
            Kontrollfeld dann wieder vollständig einblenden.
          </p>
        </div>
      }
    />
  );
};
export default Component;
Component.defaultProps = {
  showModalMenu: () => {},
};
