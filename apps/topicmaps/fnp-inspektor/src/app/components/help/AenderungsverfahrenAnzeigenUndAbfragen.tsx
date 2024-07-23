import Section from 'react-cismap/topicmaps/menu/Section';
import Icon from 'react-cismap/commons/Icon';
import { useContext } from 'react';
import { UIDispatchContext } from 'react-cismap/contexts/UIContextProvider';

const AenderungsverfahrenAnzeigenUndAbfragen = () => {
  const { setAppMenuActiveMenuSection } = useContext(UIDispatchContext);

  return (
    <Section
      sectionKey="AenderungsverfahrenAnzeigenUndAbfragen"
      sectionTitle="Änderungsverfahren anzeigen und abfragen"
      sectionBsStyle="success"
      sectionContent={
        <div>
          <p>
            Ein vollständiger Überblick über die FNP-Änderungsverfahren (ÄV)
            durch Anzeige aller ÄV-Geltungsbereiche in der Karte ist nur im{' '}
            <strong>Rechtsplan</strong> möglich, nicht in der Arbeitskarte.
            Klicken Sie dazu auf die Schaltfläche "Änderungsverfahren anzeigen"
            über der Info-Box. In diesem Modus wird die Transparenz der
            Hintergrundkarte erhöht. Sie wird dadurch blasser, so dass die
            Geltungsbereiche der ÄV deutlicher hervortreten. Ein willkommener
            Nebeneffekt: Die Schriften des unter dem Rechtsplan liegenden
            Stadtplans scheinen nun durch und erleichtern Ihnen die
            Orientierung. Die rechtswirksamen ÄV werden mit einem grünen Umring
            dargestellt, die noch nicht rechtswirksamen ÄV mit einem roten
            Umring. Durch erneutes Anklicken der o. g. Schaltfläche, die jetzt
            die Beschriftung "Änderungsverfahren verbergen" trägt, können sie
            die ÄV wieder ausblenden.
          </p>
          <p>
            Mit einem Doppelklick auf einen ÄV-Geltungsbereich werden alle
            Änderungsverfahren geladen, die an dieser Stelle liegen - meistens
            genau eines, in seltenen Fällen auch mehrere (z. B. beim ÄV 18, das
            teilweise vom ÄV 103 überlagert wird). Mit einem weiteren Klick auf
            diese Fläche wird der Kartenausschnitt so angepasst, dass der
            ÄV-Geltungsbereich vollständig und zentriert dargestellt wird. In
            der Info-Box rechts unten werden ihnen die Detailinformationen zum
            ersten der geladenen ÄV angezeigt. Wenn mehrere ÄV geladen wurden,
            können Sie sich mit den Schaltflächen <a>&gt;&gt;</a> (nächster
            Treffer) und <a>&lt;&lt;</a> (vorheriger Treffer) im Fußbereich der
            Info-Box durch die Änderungsverfahren bewegen. Ein Doppelklick
            außerhalb der angezeigten ÄV-Geltungsbereiche entfernt alle zuvor
            geladenen ÄV.
          </p>
          <p>
            Es gibt zwei Arten von FNP-Änderungsverfahren:{' '}
            <strong>Änderungen</strong> gemäß §2 ff. BauGB und die
            leichtgewichtigeren <strong>Berichtigungen</strong> gemäß § 13a
            BauGB. Dieser Unterschied wird bei der Angabe der Bezeichnung des
            Änderungsverfahrens in der Info-Box berücksichtigt, z. B. "47.
            FNP-Berichtigung" im Gegensatz zu "11. FNP-Änderung". Durch
            Anklicken des PDF-Symbols in der Info-Box öffnen Sie in einer neuen
            Registerkarte Ihres Browsers einen Dokumentenviewer, der Ihnen die
            Dokumente zu dem aktuell angezeigten FNP-Änderungsverfahren
            bereitstellt (s.{' '}
            <a
              onClick={() => setAppMenuActiveMenuSection('DokumenteBetrachten')}
            >
              Dokumente betrachten
            </a>
            ). Außerdem werden in der Info-Box ggf. das Datum der
            Rechtswirksamkeit des ÄV und - ebenfalls als Link zum
            Dokumentenviewer - die Nummer des B-Plans, der Anlass für die
            FNP-Änderung war, angezeigt.
          </p>
          <p>
            Mit der Schaltfläche <Icon name="chevron-circle-down" /> im
            dunkelgrau abgesetzten rechten Rand der Info-Box lässt sich diese so
            verkleinern, dass nur noch die ÄV-Bezeichnung und das verkleinerte
            PDF-Symbol zum Starten des Dokumentenviewers angezeigt werden -
            nützlich für Endgeräte mit kleinem Display. Mit der Schaltfläche{' '}
            <Icon name="chevron-circle-up" /> an derselben Stelle können Sie die
            Info-Box wieder vollständig einblenden.
          </p>
        </div>
      }
    />
  );
};

export default AenderungsverfahrenAnzeigenUndAbfragen;
