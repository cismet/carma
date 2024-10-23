import { useContext } from "react";
import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";
import DefaultAppMenu from "react-cismap/topicmaps/menu/DefaultAppMenu";
import Section from "react-cismap/topicmaps/menu/Section";
import CismetFooterAcks from "react-cismap/topicmaps/wuppertal/CismetFooterAcknowledgements";

const Menu = () => {
  const { windowSize } = useContext(ResponsiveTopicMapContext);
  let height;

  if (windowSize?.height) {
    height = windowSize?.height * 0.9;
  } else {
    height = 250;
  }
  console.log("height", height);

  return (
    <DefaultAppMenu
      menuTitle='Einstellungen, Statistik und Kompaktanleitung'
      previewMapPosition='lat=51.27002449822632&lng=7.203538091853262&zoom=14'
      titleCheckBoxlabel='Titel anzeigen'
      introductionMarkdown={`Über **Einstellungen** können Sie die Darstellung der Hintergrundkarte 
                und der Objekte an Ihre Vorlieben anpassen. Unter **Statistik** finden 
                Sie eine Darstellung der aktuellen Fallzahlen. Wählen Sie 
                **Kompaktanleitung** für detailliertere Bedienungsinformationen.
      `}
      simpleHelp={{
        content: `Ein kostenloser Corona-Schnelltest pro Woche - dieses Angebot richtet sich seit 
        Mitte März 2021 an jede Bürgerin und jeden Bürger. Auch in Wuppertal entstehen immer mehr 
        Schnelltestzentren. Die Corona-Präventionskarte bietet einen Überblick über die Testzentren 
        und sonstige relevante Einrichtungen wie das Corona-Impfzentrum. Die Informationen zu diesen 
        "Corona-Präventionsorten" werden zunächst vom Presseamt der Stadt Wuppertal auf der städtischen 
        Homepage publiziert und von dort zeitnah vom Team "Stadtkartographie" in den Datensatz der 
        [interessanten Orte](https://offenedaten-wuppertal.de/dataset/interessante-orte-poi-wuppertal) 
        (Points of Interest, kurz POI) im Wuppertaler Stadtgebiet übernommen. Diese Daten sind die 
        Grundlage für die Darstellung in der Corona-Präventionskarte. Sie sind auch im Open-Data-Angebot 
        der Stadt Wuppertal im täglich automatisch aktualisierten Datensatz 
        [Corona-Präventionsorte Wuppertal](https://offenedaten-wuppertal.de/dataset/corona-pr%C3%A4ventionsorte-wuppertal) 
        verfügbar.`,
      }}
      sections={{
        _10statistics: (
          <Section
            key='statistik'
            sectionKey='StatistikSection'
            sectionTitle='Statistik (aktuelle Fallzahlen)'
            sectionBsStyle='danger'
            sectionContent={
              <div>
                <p>
                  Das folgende Diagramm wird stündlich automatisch an die beim Gesundheitsamt zur
                  COVID-19-Epidemie erfassten Fallzahlen angepasst. Bewegen Sie den Mauszeiger auf
                  eine der farbigen Säulen in der Grafik, um sich die jeweilige Fallzahl und das
                  zugehörige Referenzdatum anzeigen zu lassen. Durch Anklicken der farbigen Punkte
                  in der Legende unterhalb des Diagramms können Sie einzelne Rubriken aus- und
                  wieder einblenden.
                </p>

                <iframe
                  title='Corona Dashboard'
                  width='100%'
                  frameBorder='0'
                  height={height > 750 ? height : 750}
                  src='https://stadt-wuppertal.maps.arcgis.com/apps/opsdashboard/index.html#/08a2f92cd26c4f459a7f0ee42f7653ce'
                ></iframe>
              </div>
            }
          />
        ),
      }}
      menuFooter={
        <div style={{ fontSize: "11px" }}>
          <b>Hintergrundkarten</b>: Stadtkarte 2.0 © RVR | True Orthophoto 2022 © Stadt Wuppertal{" "}
          <br />
          <CismetFooterAcks />
        </div>
      }
    ></DefaultAppMenu>
  );
};
export default Menu;
