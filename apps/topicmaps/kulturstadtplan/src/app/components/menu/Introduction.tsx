import { useContext } from 'react';
import { UIDispatchContext } from 'react-cismap/contexts/UIContextProvider';
import { Link } from 'react-scroll';

const Introduction = () => {
  const { setAppMenuActiveMenuSection } = useContext(UIDispatchContext);

  return (
    <span>
      Der <strong>Kulturstadtplan Wuppertal</strong> präsentiert Ihnen alle
      Points Of Interest (POI) aus unserem Open-Data-Datensatz{' '}
      <a
        href="https://offenedaten-wuppertal.de/dataset/interessante-orte-wuppertal-poi"
        target="_opendata"
      >
        Interessante Orte Wuppertal (POI)
      </a>
      , die dort als kultureller Veranstaltungsort eingeordnet sind. Unter{' '}
      <Link
        to="filter"
        containerId="myMenu"
        smooth={true}
        delay={100}
        onClick={() => setAppMenuActiveMenuSection('filter')}
        className="renderAsLink"
      >
        Mein Kulturstadtplan
      </Link>{' '}
      können Sie die angezeigten POI auf die Kategorien beschränken, die Sie
      interessieren oder nach den jeweils angebotenen Veranstaltungsarten
      filtern. Über{' '}
      <Link
        to="settings"
        containerId="myMenu"
        smooth={true}
        delay={100}
        onClick={() => setAppMenuActiveMenuSection('settings')}
        className="renderAsLink"
      >
        Einstellungen
      </Link>{' '}
      können Sie die Karten- und POI-Darstellung an Ihre Vorlieben anpassen.
      Wählen Sie{' '}
      <Link
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
