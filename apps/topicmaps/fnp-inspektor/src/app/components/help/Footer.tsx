import { useContext } from 'react';
import { UIDispatchContext } from 'react-cismap/contexts/UIContextProvider';

const Footer = () => {
  const { setAppMenuActiveMenuSection } = useContext(UIDispatchContext);

  return (
    <div>
      <span style={{ fontSize: '11px' }}>
        <div>
          <strong>Hintergrundkarte</strong>: Stadtkarte 2.0 © RVR | Amtliche
          Basiskarte (ABK), B-Plan-Geltungsbereiche (
          <a
            target="ackmore"
            href="https://offenedaten-wuppertal.de/dataset/rechtsverbindliche-bebauungspl%C3%A4ne-wuppertal"
          >
            rechtswirksam{' '}
          </a>{' '}
          |{' '}
          <a
            target="ackmore"
            href="https://offenedaten-wuppertal.de/dataset/laufende-bebauungsplanverfahren-wuppertal"
          >
            laufende Verfahren
          </a>
          ) © Stadt Wuppertal |
          <a
            target="ackmore"
            href="http://www.geodatenzentrum.de/geodaten/gdz_rahmen.gdz_div?gdz_spr=deu&amp;gdz_akt_zeile=4&amp;gdz_anz_zeile=4&amp;gdz_unt_zeile=0&amp;gdz_user_id=0"
          >
            {' '}
            WebAtlasDE
          </a>{' '}
          © BKG{' '}
          <a onClick={() => setAppMenuActiveMenuSection('hintergrundkarte')}>
            (Details und Nutzungsbedingungen)
          </a>
          <div>
            <b>TopicMaps Wuppertal (Version 1.22.5)</b>:{' '}
            <a href="https://cismet.de/" target="_cismet">
              cismet GmbH
            </a>{' '}
            auf Basis von{' '}
            <a href="http://leafletjs.com/" target="_more">
              Leaflet
            </a>{' '}
            und{' '}
            <a href="https://cismet.de/#refs" target="_cismet">
              cids | WuNDa
            </a>{' '}
            |{' '}
            <a
              target="_blank"
              rel="noopener noreferrer"
              href="https://cismet.de/datenschutzerklaerung.html"
            >
              Datenschutzerklärung (Privacy Policy)
            </a>
          </div>
        </div>
      </span>
    </div>
  );
};

export default Footer;
