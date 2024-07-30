import Section from 'react-cismap/topicmaps/menu/Section';
import { useContext } from 'react';
import { UIDispatchContext } from 'react-cismap/contexts/UIContextProvider';

const FlaechenInDerArbeitskarteAuswaehlenUndAbfragen = () => {
  const { setAppMenuActiveMenuSection } = useContext<UIDispatchContext>(UIDispatchContext);

  return (
    <Section
      sectionKey="FlaechenInDerArbeitskarteAuswaehlenUndAbfragen"
      sectionTitle="Flächen in der Arbeitskarte auswählen und abfragen"
      sectionBsStyle="success"
      sectionContent={
        <div>
          <p>
            In der Arbeitskarte zeigen wir Ihnen die fortgeschriebenen,
            flächenhaften Hauptnutzungen des Flächennutzungsplans (FNP). Diese
            Flächen bilden auf dem gesamten Wuppertaler Stadtgebiet ein
            lückenloses Mosaik. Mit einem Doppelklick können Sie eine dieser
            Flächen auswählen - sie erhält dann sofort den Fokus (Darstellung
            mit verstärktem schwarzem Umring und blasserer Füllfarbe), sodass
            die zugehörigen Flächeninformationen in der Info-Box angezeigt
            werden. Mit einem weiteren Klick auf diese Fläche wird der
            Kartenausschnitt so angepasst, dass sie vollständig und zentriert
            dargestellt wird. Ein Doppelklick auf eine Position außerhalb des
            Wuppertaler Stadtgebiets setzt die Auswahl der Hauptnutzungsfläche
            zurück. In der Info-Box werden dann wieder die anfänglichen, kurzen
            Bedienungshinweise angezeigt.
          </p>
          <p>
            Im farbigen Titelbalken der Info-Box wird die übergeordnete
            Kategorie der jeweils ausgewählten Hauptnutzungsfläche angezeigt, z.
            B. "Fläche für den Gemeinbedarf". Die Hintergrundfarbe des
            Titelbalkens greift dabei die Farbsystematik der Kartendarstellung
            auf. Die Überschrift im Inneren der Info-Box nennt die konkrete
            Zweckbestimmung der Fläche mit ihrer auf 0,1 Hektar gerundete Größe,
            z. B. "Schulische Zwecke (1,4 Ha)". Ein Hektar entspricht ungefähr
            der Größe von 1,4 Fußballfeldern. Wenn die ausgewählte
            Hauptnutzungsfläche im Rechtsplan mit einem punktförmigen Symbol
            dargestellt ist, wird dieses rechts neben der Überschrift angezeigt.
          </p>
          <p>
            Zusätzlich finden Sie in der Info-Box noch die Angabe, seit wann die
            ausgewählte Fläche rechtswirksam ist und wodurch die Festlegung
            erfolgte, nämlich durch den FNP vom 17.01.2005 selbst oder ein
            FNP-Änderungsverfahren (ÄV). Bei Hauptnutzungsflächen, die durch ein
            ÄV festgelegt wurden, wird die Bezeichnung des ÄV und ggf. auch die
            Nummer des B-Plans, der Anlass für die FNP-Änderung war, angegeben.
            Solche Hinweise auf Änderungsverfahren und B-Pläne sind als Links
            ausgeführt, die den Dokumentenviewer mit den zugehörigen Dokumenten
            öffnen (s.{' '}
            <a
              onClick={() => setAppMenuActiveMenuSection('DokumenteBetrachten')}
            >
              Dokumente betrachten
            </a>
            ). Sofern sich die ausgewählte Hauptnutzungsfläche zu mindestens 80%
            mit noch nicht rechtswirksamen ÄV überlappt, werden zusätzlich unter
            "<strong>s. auch</strong>" Dokumentenviewer-Links auf diese ÄV
            angeboten. Auch in der Arbeitskarte können Sie die Info-Box so
            verkleinern, dass nur noch der Titelbalken, die Überschrift und ggf.
            das Symbol angezeigt werden (s.{' '}
            <a
              onClick={() =>
                setAppMenuActiveMenuSection(
                  'AenderungsverfahrenAnzeigenUndAbfragen'
                )
              }
            >
              Änderungsverfahren anzeigen und abfragen
            </a>
            ).
          </p>
          <p>
            Der FNP enthält einige von der Bezirksregierung Düsseldorf als
            zuständiger Aufsichtsbehörde mit ihren Verfügungen vom 14.10. und
            02.12.2004, Az. 35.2-11.14 (Wup neu), nicht genehmigte
            Darstellungen, die in der Arbeitskarte als weiße Flächen angezeigt
            werden. Sie sind im Rechtsplan und seiner Legende von 1 bis 5
            durchnummeriert. Nach einem Doppelklick auf eine solche Fläche in
            der Arbeitskarte werden in der Info-Box spezifische
            Detailinformationen zu dieser Fläche einschließlich ihrer Nummer im
            Rechtsplan angezeigt.
          </p>
        </div>
      }
    />
  );
};

export default FlaechenInDerArbeitskarteAuswaehlenUndAbfragen;
