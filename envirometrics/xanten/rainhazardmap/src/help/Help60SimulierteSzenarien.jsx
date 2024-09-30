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
            Die Simulationen wurden mit "künstlichen"
            Modellregen durchgeführt. Bei diesen Simulationen erfolgt eine
            flächenhafte Beregnung des gesamten Gebiets mit statistisch
            ermittelten oder angenommenen Niederschlagsbelastungen. Die
            verwendeten <strong>Modellregen</strong> werden durch die Dauer (in
            Stunden, abgekürzt "h"), die in dieser Zeit fallende Regenmenge (in
            Liter pro Quadratmeter, abgekürzt "l/m²") definiert. Die Modellregen
            haben eine zeitliche Dauer von 60 Minuten und werden als sogenannte{" "}
            <strong>Blockregen</strong> verwendet.
            Das bedeutet, dass der
            Intensitätsverlauf über die gesamte Dauer des Ereignisses konstant
            ist. Im Anschluss an das Niederschlagsereignis werden weitere 60
            Minuten Nachlaufzeit simuliert.
          </p>

          <p>
            Zur Einteilung der Starkregen dient der ortsbezogene{" "}
            <strong>Starkregenindex (SRI)</strong> nach Schmitt, der
            Niederschläge in eine Skala von 1 bis 12 einteilt, vergleichbar mit
            der Klassifizierung von Erdbeben nach Mercalli. Der Starkregenindex
            wird durch eine statistische Auswertung von sehr langen vorliegenden
            Regenmessungen an die örtlichen Gegebenheiten angepasst. Starkregen
            mit SRI 6 bis 7 (<strong>außergewöhnliche Starkregen</strong>) haben
            statistische Wiederkehrzeiten von 50 bis 100 Jahren. Für noch
            stärkere <strong>extreme Starkregen</strong> lässt sich aus der
            Statistik kein verlässliches Wiederkehrintervall mehr ableiten
            (seltener als einmal in 100 Jahren). Der Niederschlag, der in
            Münster 2014 mit insgesamt 292 mm gemessen wurde und starke Schäden
            verursachte, gehört z. B. zu der Stufe SRI 12.
          </p>

          <p>
            Mit diesen Erläuterungen lassen sich die zwei simulierten Szenarien
            wie folgt zusammenfassen:
          </p>

          <ul>
            <li>
              <strong>Stärke 7</strong>: außergewöhnliches Starkregenereignis,
              Dauer 60 min, räumlich differenzierte Niederschlagssumme von 38,7 bis
              39,5 l/m², Blockregen , SRI 7, 100-jährliche Wiederkehrzeit nach
              KOSTRA-DWD-2020
            </li>

            <li>
              <strong>Stärke 11</strong>: extremes Starkregenereignis, Dauer
              60 min, Niederschlagssumme 90 l/m², Blockregen, SRI 11,
              Wiederkehrzeit deutlich größer als 100 Jahre
            </li>
          </ul>
        </div>
      }
    />
  );
};
export default Component;
