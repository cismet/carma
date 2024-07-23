import Section from 'react-cismap/topicmaps/menu/Section';
import Icon from 'react-cismap/commons/Icon';
import { useContext } from 'react';
import { UIDispatchContext } from 'react-cismap/contexts/UIContextProvider';

const AenderungsverfahrenSuchenUndDurchmustern = () => {
  const { setAppMenuActiveMenuSection } = useContext(UIDispatchContext);

  return (
    <Section
      sectionKey="AenderungsverfahrenSuchenUndDurchmustern"
      sectionTitle="Änderungsverfahren suchen und durchmustern"
      sectionBsStyle="success"
      sectionContent={
        <div>
          <p>
            Durch Anklicken von <Icon name="search" /> links neben dem
            Eingabefeld suchen Sie nach FNP-Änderungsverfahren (ÄV), die
            zumindest teilweise im aktuellen Kartenausschnitt liegen. (Diese
            Funktion ist nur im <strong>Rechtsplan</strong> verfügbar, nicht in
            der Arbeitskarte.) Alle ÄV werden geladen, wobei der Fokus (blaue
            Umrandung) auf das Verfahren mit der niedrigsten Nummer gesetzt
            wird. Sofern erforderlich wird zuvor die{' '}
            <a
              onClick={() =>
                setAppMenuActiveMenuSection(
                  'AenderungsverfahrenAnzeigenUndAbfragen'
                )
              }
            >
              Anzeige der Änderungsverfahren
            </a>{' '}
            in der Karte aktiviert. In der Info-Box werden Ihnen immer die
            Detailinformationen und die Verknüpfung zur Dokumentbetrachtung für
            das ÄV angeboten, das gerade den Fokus hat.
          </p>
          <p>
            Der farbige Titelbalken der Info-Box greift für den Verfahrensstand
            (Grobkategorie) des Änderungsverfahrens die Farbsystematik der
            Kartendarstellung auf: Grün für rechtswirksame Verfahren, Rot für
            nicht rechtswirksame. Zusätzlich wird der Verfahrensstand auch als
            Text im Titelbalken ausgeprägt.
          </p>
          <p>
            Mit einem einfachen Klick auf einen anderen ÄV-Geltungsbereich aus
            der Treffermenge erhält das zugehörige ÄV den Fokus. Mit einem
            weiteren Klick auf diese Fläche wird der Kartenausschnitt so
            angepasst, dass der Geltungsbereich vollständig und zentriert
            dargestellt wird. Alternativ können Sie die Treffermenge mit den
            Schaltflächen <a>&gt;&gt;</a> (nächster Treffer) und <a>&lt;&lt;</a>{' '}
            (vorheriger Treffer) durchmustern. (Die Treffermenge ist nach
            aufsteigenden Nummern der ÄV geordnet.) Mit{' '}
            <a>alle Treffer anzeigen</a> können Sie den Kartenausschnitt zuvor
            so anpassen, dass alle ÄV-Geltungsbereiche der Treffermenge
            vollständig angezeigt werden. Mit einem Doppelklick entfernen Sie
            alle zuvor geladenen ÄV. Wenn Sie diesen Doppelklick im
            Geltungsbereich eines ÄV ausführen, wird statt dessen dieses
            Verfahren geladen (s.{' '}
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
        </div>
      }
    />
  );
};

export default AenderungsverfahrenSuchenUndDurchmustern;
