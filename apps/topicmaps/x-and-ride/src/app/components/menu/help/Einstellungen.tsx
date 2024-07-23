import Icon from 'react-cismap/commons/Icon';
import { Link } from 'react-scroll';
import { useContext } from 'react';
import { UIDispatchContext } from 'react-cismap/contexts/UIContextProvider';

const Einstellungen = () => {
  const { setAppMenuActiveMenuSection } = useContext(UIDispatchContext);

  return (
    <>
      <p>
        Unter "<strong>Einstellungen</strong>" können Sie im Anwendungsmenü{' '}
        <Icon name="bars" /> festlegen, wie die P+R- und B+R-Anlagen und die
        Hintergrundkarte angezeigt werden sollen.
      </p>
      <p>
        Zu den Anlagen können Sie unter "
        <b>
          <i>P+R / B+R Einstellungen</i>
        </b>
        " auswählen, ob Ihre unter "<b>Filter</b>" festgelegten
        Filterbedingungen in einer Titelzeile ausgeprägt werden oder nicht.
        Weiter können Sie dort festlegen, ob räumlich nah beieinander liegende
        Anlagen maßstabsabhängig zu einem Punktsymbol zusammengefasst werden
        oder nicht. Unter "
        <b>
          <i>Symbolgröße</i>
        </b>
        " können Sie in Abhängigkeit von Ihrer Bildschirmauflösung und Ihrem
        Sehvermögen auswählen, ob die P+R- und B+R-Anlagen mit kleinen (35
        Pixel), mittleren (45 Pixel) oder großen (55 Pixel) Symbolen angezeigt
        werden.
      </p>

      <p>
        Unter "
        <strong>
          <em>Hintergrundkarte</em>
        </strong>
        " können Sie auswählen, ob Sie die standardmäßig aktivierte farbige
        Hintergrundkarte verwenden möchten ("<em>Stadtplan (Tag)</em>") oder
        lieber eine invertierte Graustufenkarte ("<em>Stadtplan (Nacht)</em>"),
        zu der uns die von vielen PKW-Navis bei Dunkelheit eingesetzte
        Darstellungsweise inspiriert hat. <strong>Hinweis</strong>: Der
        Stadtplan (Nacht) wird Ihnen nur angeboten, wenn Ihr Browser
        CSS3-Filtereffekte unterstützt, also z. B. nicht beim Microsoft Internet
        Explorer. Die Nacht-Karte erzeugt einen deutlicheren Kontrast mit den
        farbigen Symbolen der P+R- bzw. B+R-Anlagen, die unterschiedlichen
        Flächennutzungen in der Hintergrundkarte lassen sich aber nicht mehr so
        gut unterscheiden wie in der Tag-Karte. Als dritte Möglichkeit steht
        eine <i>Luftbildkarte</i> zur Verfügung, die die Anschaulichkeit des
        Luftbildes mit der Eindeutigkeit des Stadtplans (Kartenschrift,
        durchscheinende Linien) verbindet. Zusätzlich können Sie mit dem
        Kontrollkästchen "<em>Umweltzonen</em>" steuern, ob die Umweltzonen
        dargestellt werden oder nicht. Die Umweltzonen lassen sich mit allen
        drei Hintergrundkarten kombinieren. Ihre Darstellung in der Karte ist
        vor allem dann sinnvoll, wenn Sie die{' '}
        <Link
          to="MeinThemenstadtplan"
          containerId="myMenu"
          onClick={() => setAppMenuActiveMenuSection('filter')}
          className="renderAsLink"
        >
          Filteroption
        </Link>{' '}
        "<em>innerhalb/außerhalb Umweltzone</em>" verwenden.
      </p>

      <p>
        In der{' '}
        <b>
          <i>Vorschau</i>
        </b>{' '}
        sehen Sie direkt die Wirkung ihrer Einstellungen in einem fest
        eingestellten Kartenausschnitt.
      </p>
    </>
  );
};

export default Einstellungen;
