import { useSelector } from 'react-redux';
import { getHoveredObject } from '../../store/slices/ui';
import { getGraphqlStatus } from '../../store/slices/mapping';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faExclamation,
  faInfoCircle,
  faSpinner,
} from '@fortawesome/free-solid-svg-icons';

const Toolbar = () => {
  const properties = useSelector(getHoveredObject);
  const status = useSelector(getGraphqlStatus);
  const hint =
    'Zur Anzeige aller Flächen und Fronten, bitte eine größere Zoomstufe wählen';
  return (
    <div className="relative mt-2 bg-white text-lg w-full z-[999] pointer-events-none flex gap-1 opacity-75">
      <span style={{ width: 20, textAlign: 'center' }}>
        {status === 'LOADING' && (
          <FontAwesomeIcon icon={faSpinner} className="fa-spin opacity-50" />
        )}
        {status === 'LOADED' && (
          <FontAwesomeIcon icon={faInfoCircle} className="opacity-50" />
        )}
        {status === 'NOT_ALLOWED' && (
          <FontAwesomeIcon icon={faExclamation} className="opacity-50" />
        )}
      </span>
      {status !== 'NOT_ALLOWED' && properties?.kassenzeichen && (
        <span>
          Kassenzeichen: {properties.kassenzeichen}::
          {properties.bezeichnung}
        </span>
      )}
      {status !== 'NOT_ALLOWED' &&
        properties?.kassenzeichen &&
        properties.anschlussgrad && <span>{' - '}</span>}
      {status !== 'NOT_ALLOWED' && properties?.anschlussgrad && (
        <span>{properties.anschlussgrad}</span>
      )}
      {status === 'NOT_ALLOWED' && <span>{hint}</span>}
    </div>
  );
};

export default Toolbar;
