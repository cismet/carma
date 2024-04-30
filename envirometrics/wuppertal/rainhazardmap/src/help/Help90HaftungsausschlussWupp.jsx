import React, { useContext } from "react";
import { UIDispatchContext } from "react-cismap/contexts/UIContextProvider";
import GenericModalMenuSection from "react-cismap/topicmaps/menu/Section";
/* eslint-disable jsx-a11y/anchor-is-valid */

const Component = ({ appName }) => {
  const { setAppMenuActiveMenuSection } = useContext(UIDispatchContext);

  return (
    <GenericModalMenuSection
      sectionKey='haftungsausschluss'
      sectionTitle='Haftungsausschluss'
      sectionBsStyle='danger'
      sectionContent={
        <div>
          <p>
            Alle hier veröffentlichten Informationen wurden mit der bestmöglichen Sorgfalt
            zusammengestellt und kontrolliert. Dennoch sind Fehler nie ausgeschlossen, sodass für
            die Richtigkeit und damit auch Nutzbarkeit der Informationen keine Gewähr übernommen
            werden kann (vgl. auch Abschnitt{" "}
            <a class='renderAsLink' onClick={() => setAppMenuActiveMenuSection("aussagekraft")}>
              Aussagekraft der Simulationen
            </a>{" "}
            zu den beim heutigen Stand der Technik unvermeidbaren Unschärfen und Fehlern von
            modellbasierten Simulationen des Starkregenabflusses). Eine Haftung für Schäden, die
            sich aus der Nutzung der Informationen ergeben, wird daher ausgeschlossen. Dem stimmen
            Sie mit der Nutzung der Daten zu.
          </p>
        </div>
      }
    />
  );
};
export default Component;
