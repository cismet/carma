import React, { useContext } from "react";
import GenericModalMenuSection from "react-cismap/topicmaps/menu/Section";
import { UIDispatchContext } from "react-cismap/contexts/UIContextProvider";

const Component = ({ uiState, uiStateActions }) => {
  const { setAppMenuActiveMenuSection } = useContext(UIDispatchContext);

  return (
    <GenericModalMenuSection
      uiState={uiState}
      uiStateActions={uiStateActions}
      sectionKey="szenarien"
      sectionTitle="Häufig gestellte Fragen"
      sectionBsStyle="info"
      sectionContent={
        <div>
          <h4>Warum ist mein Gebäude nicht im Solarkataster enthalten?</h4>
          <p>
            Das Solarkataster basiert hauptsächlich auf flugzeuggestützt
            erfassten Punktwolken und amtlichen Gebäudegrundrissen (ALKIS). Wenn
            Ihr Gebäude nicht im Solarkataster enthalten ist, handelt es sich
            möglicherweise um ein neu errichtetes Gebäude, dessen Geodaten noch
            nicht in die zur Solarpotenzialberechnung verwendeten Datenbanken
            aufgenommen wurden.
          </p>
          <p>
            Ihr Gebäude könnte bei der nächsten Aktualisierung des
            Solarkatasters berücksichtigt werden, die jedoch von der
            Verfügbarkeit neuer Punktwolken abhängt. Diese Punktwolken werden
            nur in regelmäßigen Abständen, oft über Jahre hinweg, erfasst. Wenn
            Sie in der Zwischenzeit eine Solaranlage installieren möchten,
            könnte die Wartezeit zu lang sein.
          </p>
          <p>
            <strong>Tipp:</strong> Wenn Ihr Gebäude nicht im Solarkataster
            erfasst ist, können Sie ein vergleichbares Gebäude in Ihrer
            Nachbarschaft auswählen und die Analyse anhand dieses Objekts
            durchführen, um eine Einschätzung des Solarpotenzials zu erhalten.
          </p>

          <h4>
            Warum wird der Dachüberstand meines Gebäudes nicht berücksichtigt?
          </h4>
          <p>
            Das Solarkataster verwendet für die Gebäudeerkennung
            flugzeuggestützt erfasste Punktwolken und amtliche
            Gebäudegrundrisse. Da diese Grundrisse keine Dachüberstände
            umfassen, können diese bei der Analyse des Solarpotenzials leider
            nicht berücksichtigt werden.
          </p>

          <h4>
            Berücksichtigt das Solarkataster die Verschattung durch umliegende
            Bäume, Gebäude oder Gelände?
          </h4>
          <p>
            Ja, das Solarkataster berücksichtigt Verschattungseffekte durch
            umliegende Objekte wie Bäume, benachbarte Gebäude oder auch
            Geländeformen (wie Berge). Die Berechnung der solaren Einstrahlung
            erfolgt auf Basis der Punktwolke, die die Erdoberfläche in 3D
            abbildet. Hierbei wird der Sonnenstand im Tages- und Jahresverlauf
            simuliert, sodass jeder Punkt auf einer Dachfläche individuell
            bewertet wird. Das bedeutet, dass jeder Punkt auf einem Dach über
            das ganze Jahr hinweg mit einem spezifischen Einstrahlungswert
            versehen wird, der die tatsächliche Verschattung berücksichtigt.
          </p>
        </div>
      }
    />
  );
};
export default Component;
