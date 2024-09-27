import React, { useContext } from "react";
import GenericModalMenuSection from "react-cismap/topicmaps/menu/Section";
import Icon from "react-cismap/commons/Icon";
import { CustomizationContext } from "react-cismap/contexts/CustomizationContextProvider";

const Component = ({ defaultContextValues = {}, email }) => {
  const customizations =
    useContext(CustomizationContext) || defaultContextValues;
  let modellfehlermeldenContent =
    customizations?.helpmenu?.modellfehlermeldenContent;
  let _email =
    email ||
    customizations?.helpmenu?.modellfehlermelden?.email ||
    "starkregen@cismet.de";
  return (
    <GenericModalMenuSection
      sectionKey="modellfehlermelden"
      sectionTitle="Fehler im Geländemodell melden"
      sectionBsStyle="danger"
      sectionContent={
        modellfehlermeldenContent || (
          <div>
            <p>
              Wenn die Simulationsergebnisse eine Überflutungsgefährdung
              darstellen, die im Widerspruch zu Ihren vor Ort gewonnen
              Erfahrungen steht, liegt das wahrscheinlich an einem Fehler im
              Digitalen Geländemodell (DGM), das bei der Simulationsberechnung
              verwendet wird.
            </p>
            <p>
              Woher kommen solche Fehler? Das DGM wird aus Höhenmessungen
              abgeleitet, die mit einem Laserscanner aus einem Flugzeug heraus
              durchgeführt werden. Bei diesem Messverfahren werden Brücken,
              Tunnel und Gewässerdurchlässe, die für das Abflussverhalten des
              Oberflächenwassers wichtig sind, nicht erkannt. Sie werden daher
              nachträglich manuell in das DGM eingearbeitet. Wenn dabei ein für
              den Abfluss sehr wichtiges Element übersehen wurde, wird u. U. in
              der Simulationsberechnung aus einer Brücke ein Damm. Im Ergebnis
              wird dann eine Aufstauung des Wassers angezeigt, die sich im
              Gelände so nicht einstellen würde!
            </p>
            <p>
              <b>
                Bitte helfen Sie bei der Verbesserung des Geländemodells, indem
                Sie uns auf solche möglichen Fehler hinweisen.
              </b>{" "}
              Stellen Sie dazu die Kartenansicht (Ausschnitt, Hintergrundkarte
              und Simulation) ein, die den von Ihnen vermuteten Fehler im DGM
              bestmöglich darstellt. Durch Anklicken des Werkzeuges{" "}
              <Icon name="comment" /> "Fehler im Geländemodell melden" links
              oben im Kartenfenster öffnen Sie das auf Ihrem Rechner
              eingerichtete E-Mail-Programm mit dem Gerüst einer Nachricht an{" "}
              <a href={"mailto:" + _email}>{_email}</a>. Über diese
              Funktionsadresse sprechen Sie eine Gruppe von Experten der
              Stadtverwaltung an. Das automatisch erzeugte E-Mail-Gerüst enthält
              einen Link, mit dem diese Experten die Starkregengefahrenkarte
              genau in dem Zustand öffnen können, den Sie eingestellt haben.
              Bitte ergänzen Sie Ihre E-Mail mit einer kurzen Darstellung des
              vermuteten Fehlers. Wo wurde vermutlich ein wichtiger
              Gewässerdurchlass o. ä. übersehen?
            </p>
            <p>
              In der nächsten Neuberechnung der Simulationen werden diese
              Anpassungen dann berücksichtigt. Bitte beachten Sie in diesem
              Zusammenhang die Versionsangabe der Simulationsergebnisse im
              Fußbereich dieser Kompaktanleitung.
            </p>
          </div>
        )
      }
    />
  );
};
export default Component;
