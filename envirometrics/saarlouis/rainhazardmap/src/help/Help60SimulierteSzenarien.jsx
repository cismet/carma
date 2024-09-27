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
      sectionTitle="Simulierte Szenarien"
      sectionBsStyle="info"
      sectionContent={
        <div>
          <p>
            Die berechneten Simulationen wurde mit "künstlichen" Modellregen
            durchgeführt. Bei dieser Simulation erfolgt eine flächenhafte
            Beregnung des gesamten Stadtgebiets mit einer statistisch
            ermittelten oder angenommenen Niederschlagsbelastung. Der verwendete{" "}
            <strong>Modellregen</strong> wird durch die Dauer (in Stunden,
            abgekürzt "h"), die in dieser Zeit fallende Regenmenge (in Liter pro
            Quadratmeter, abgekürzt "l/m²") definiert. Der Modellregen hat eine
            zeitliche Dauer von 60 Minuten. Im Anschluss an das
            Niederschlagsereignis werden weitere 120 Minuten Nachlaufzeit
            simuliert.
          </p>
          <p>
            Zur Einteilung der Starkregen dient der ortsbezogene{" "}
            <strong>Starkregenindex</strong> (SRI) nach Schmitt et al., der
            Niederschläge in eine Skala von 1 bis 12 einteilt, vergleichbar mit
            der Klassifizierung von Erdbeben nach Mercalli. Der Starkregenindex
            wird durch eine statistische Auswertung von sehr langen vorliegenden
            Regenmessungen an die örtlichen Gegebenheiten angepasst. Starkregen
            mit SRI 7 (<strong>außergewöhnliche Starkregen</strong>) haben
            statistische Wiederkehrzeiten von 100 Jahren.
          </p>

          <p>
            Mit diesen Erläuterungen lassen sich die simulierten Szenarien wie
            folgt zusammenfassen:
          </p>

          <ul>
            <li>
              <strong>SRI 6:</strong> außergewöhnliches Starkregenereignis,
              50-jährliche Wiederkehrzeit nach KOSTRA-DWD-2020 mit einer Dauer
              von 60 min, Niederschlagssumme von 46,8 l/m², Anfangsintensität
            </li>
            <li>
              <strong>SRI 7:</strong> außergewöhnliches Starkregenereignis,
              100-jährliche Wiederkehrzeit nach KOSTRA-DWD-2020 mit einer Dauer
              von 60 min, Niederschlagssumme von 52,3 l/m², Anfangsintensität
            </li>
            <li>
              <strong>SRI 10:</strong> extremes Starkregenereignis, 1,3-fache
              Niederschlagsmenge des SRI 7 mit einer Dauer von 60 min,
              Niederschlagssumme von 68,0 l/m², Anfangsintensität
            </li>
          </ul>
        </div>
      }
    />
  );
};
export default Component;
