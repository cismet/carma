import React from "react";
import GenericModalMenuSection from "react-cismap/topicmaps/menu/Section";

const Component = ({ uiState, uiStateActions }) => {
  return (
    <GenericModalMenuSection
      uiState={uiState}
      uiStateActions={uiStateActions}
      sectionKey='szenarien'
      sectionTitle='Simulierte Szenarien'
      sectionBsStyle='info'
      sectionContent={
        <div>
          <p>
            Drei der berechneten Simulationen wurden mit "künstlichen" Modellregen durchgeführt. Das
            vierte Szenario benutzt die Niederschlagsmessungen vom 29.05.2018, um das katastrophale
            Regenereignis, das Wuppertal an diesem Tag getroffen hat, in der Simulation
            nachzustellen. Hauptunterschied: Bei den Modellregen wird stets eine gleichartige
            flächenhafte Beregnung des gesamten Stadtgebietes angenommen. Das Regenereignis vom
            29.05. hat dagegen nur ein Teilgebiet der Stadt getroffen. Im Stadtbezirk Cronenberg hat
            es an diesem Tag zum Beispiel fast gar nicht geregnet!
          </p>

          <p>
            Ein <strong>Modellregen</strong> wird durch seine Dauer (in Stunden, abgekürzt "h"), die
            in dieser Zeit fallende Niederschlagsmenge (in Liter pro Quadratmeter, abgekürzt "l/m²")
            und den zeitlichen Verlauf der Regenintensität definiert. Für den Intensitätsverlauf
            gibt es zwei Modelle: beim sog. <strong>Blockregen</strong> ist die Intensität über die
            gesamte Dauer des Regenereignisses konstant. Beim <strong>Eulerregen Typ II</strong>{" "}
            werden in 5 Minuten-Abschnitten unterschiedliche Intensitäten angenommen, die bis zur
            maximalen Intensität schnell und gleichmäßig ansteigen, dann stark abfallen und danach
            allmählich abklingen.
          </p>

          <p>
            Zur Einteilung der Starkregen dient der ortsbezogene{" "}
            <strong>Starkregenindex (SRI)</strong>, der Niederschläge in eine Skala von 1 bis 12
            einteilt, vergleichbar mit der Klassifizierung von Erdbeben nach Mercalli. (Das Ereignis
            vom 29.05.2018 entsprach im Zentrum des Unwetters dem SRI 11.) Der Starkregenindex wird
            durch eine statistische Auswertung von langfristigen Niederschlagsmessungen an die
            örtlichen Gegebenheiten angepasst. Wir benutzen hierfür die Aufzeichnungen des
            Regenschreibers der Niederschlagsstation Wuppertal-Buchenhofen, der seit 1960
            kontinuierlich betrieben wird. Starkregen mit SRI 6 und 7 (
            <strong>außergewöhnliche Starkregen</strong>) haben statistische Wiederkehrzeiten von 50
            bzw. 100 Jahren. Für noch stärkere <strong>extreme Starkregen</strong> lässt sich aus
            der Regenreihe Buchenhofen kein Wiederkehrintervall ableiten.
          </p>

          <p>
            Mit diesen Erläuterungen lassen sich unsere vier simulierten Szenarien wie folgt
            zusammenfassen:
          </p>

          <ul>
            <li>
              <strong>Stärke 6</strong>: außergewöhnliches Starkregenereignis, Dauer 2 h,
              Niederschlag 38,5 l/m², Eulerregen Typ II, SRI 6, 50-jährliche Wiederkehrzeit
            </li>

            <li>
              <strong>Stärke 7</strong>: außergewöhnliches Starkregenereignis, Dauer 2 h,
              Niederschlag 42 l/m², Eulerregen Typ II, SRI 7, 100-jährliche Wiederkehrzeit{" "}
            </li>

            <li>
              <strong>Stärke 10</strong>: extremes Starkregenereignis, Dauer 1 h, Niederschlag 90
              l/m², Blockregen, SRI 10
            </li>

            <li>
              <strong>29.05.18</strong>: extremes Starkregenereignis vom 29.05.2018, gemessene
              Niederschläge mit ungleichmäßiger Verteilung, im Zentrum des Unwetters bis zu SRI 11
            </li>
          </ul>
        </div>
      }
    />
  );
};
export default Component;
