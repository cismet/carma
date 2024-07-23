import { useContext } from 'react';
import { UIDispatchContext } from 'react-cismap/contexts/UIContextProvider';

const Introduction = () => {
  const { setAppMenuActiveMenuSection } = useContext(UIDispatchContext);

  return (
    <span>
      Benutzen Sie die Auswahlmöglichkeiten unter{' '}
      <a onClick={() => setAppMenuActiveMenuSection('filter')}>Filter</a>, um
      die in der Karte angezeigten Lade- und Verleihstationen für E-Fahrräder
      auf die für Sie relevanten Stationen zu beschränken. Über{' '}
      <a onClick={() => setAppMenuActiveMenuSection('settings')}>
        Einstellungen
      </a>{' '}
      können Sie die Darstellung der Hintergrundkarte und der Stationen an Ihre
      Vorlieben anpassen. Wählen Sie{' '}
      <a onClick={() => setAppMenuActiveMenuSection('help')}>
        Kompaktanleitung
      </a>{' '}
      für detailliertere Bedienungsinformationen.
    </span>
  );
};

export default Introduction;
