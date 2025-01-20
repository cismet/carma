import React, { useContext } from "react";
import { UIDispatchContext } from "react-cismap/contexts/UIContextProvider";
import GenericModalMenuSection from "react-cismap/topicmaps/menu/Section";
/* eslint-disable jsx-a11y/anchor-is-valid */

const Component = ({ appName }) => {
  const { setAppMenuActiveMenuSection } = useContext(UIDispatchContext);

  return (
    <GenericModalMenuSection
      sectionKey="haftungsausschluss"
      sectionTitle="Haftungsausschluss"
      sectionBsStyle="danger"
      sectionContent={
        <div>
          <p>
            Alle Informationen zur Anwendung der "Starkregengefahrenkarte der
            Stadt Saarlouis" erfolgen ohne Gewähr für ihre Richtigkeit. Es fällt
            in die Verantwortung der Betrachterinnen und Betrachter, aus den
            dargestellten Informationen die spezifische Gefährdungslage
            einzuschätzen und Schlüsse für die Durchführbarkeit oder
            Wirtschaftlichkeit von Maßnahmen zu treffen. Die Inhalte entsprechen
            dem aktuellen Kenntnisstand und wurden durch eine abgestimmte
            Methodik erzeugt. Die Aussagekraft der Ergebnisse und die
            Modellannahmen werden im Informationssystem beschrieben. Aufgrund
            neuer Erkenntnisse, modelltechnischer Entwicklungen und Vorgaben für
            die Modellierung können zukünftige Produkte von den hier
            dargestellten Ergebnissen abweichen. Umgesetzte Änderungen im
            Simulationsmodell und den resultierenden Ergebnissen werden in
            geeigneter Weise kommuniziert.
          </p>
          <p>
            In keinem Fall wird für Schäden, die sich aus der Verwendung
            abgerufener Informationen oder Online-Services ergeben, Haftung
            übernommen.
          </p>
        </div>
      }
    />
  );
};
export default Component;
