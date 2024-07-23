import { useContext } from 'react';
import { UIDispatchContext } from 'react-cismap/contexts/UIContextProvider';
import { Link } from 'react-scroll';

const Introduction = () => {
  const { setAppMenuActiveMenuSection } = useContext(UIDispatchContext);

  return (
    <span>
      Benutzen Sie die Auswahlmöglichkeiten unter{' '}
      <Link
        id="lnkHelp"
        to="help"
        containerId="myMenu"
        smooth={true}
        delay={100}
        onClick={() => setAppMenuActiveMenuSection('filter')}
        className="renderAsLink"
      >
        Filter
      </Link>
      , um die in der Karte angezeigten Park+Ride- bzw. Bike+Ride-Anlagen auf
      die für Sie relevanten Anlagen zu beschränken. Über{' '}
      <Link
        id="lnkSettings"
        to="settings"
        containerId="myMenu"
        smooth={true}
        delay={100}
        onClick={() => setAppMenuActiveMenuSection('settings')}
        className="renderAsLink"
      >
        Einstellungen
      </Link>{' '}
      können Sie die Darstellung der Hintergrundkarte und der Anlagen an Ihre
      Vorlieben anpassen. Wählen Sie{' '}
      <Link
        id="lnkHelp"
        to="help"
        containerId="myMenu"
        smooth={true}
        delay={100}
        onClick={() => setAppMenuActiveMenuSection('help')}
        className="renderAsLink"
      >
        Kompaktanleitung
      </Link>{' '}
      für detailliertere Bedienungsinformationen.
    </span>
  );
};

export default Introduction;
