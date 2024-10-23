import { faToggleOff, faToggleOn } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Button } from 'react-bootstrap';
import './button.css';
import { useSearchParams } from 'react-router-dom';

const ShowAEVModeButton = () => {
  let [searchParams, setSearchParams] = useSearchParams();
  let aevVisible = searchParams.get('aevVisible') !== null;
  const setAevVisible = (visible) => {
    if (visible && !aevVisible) {
      searchParams.set('aevVisible', 'true');
      setSearchParams(searchParams);
    } else if (!visible && aevVisible) {
      searchParams.delete('aevVisible');
      setSearchParams(searchParams);
    }
  };
  return (
    <div
      key="featureInfoModeButton"
      style={{
        marginBottom: 5,
        textAlign: 'right',
        pointerEvents: 'auto',
        position: 'absolute',
        right: 10,
        bottom: 170,
        zIndex: 99999,
      }}
    >
      <Button
        id="cmdShowGetFeatureInfo"
        variant="secondary"
        onClick={(e) => {
          e.stopPropagation();

          setAevVisible(!aevVisible);
        }}
        style={{
          width: '247px',
          fontSize: '1.2em',
          verticalAlign: 'middle',
        }}
      >
        <table>
          <tbody>
            <tr>
              <td>
                <FontAwesomeIcon
                  className="fa-1x"
                  icon={aevVisible === true ? faToggleOn : faToggleOff}
                />
              </td>
              <td style={{ paddingLeft: '5px' }}>
                <span>
                  {aevVisible === true
                    ? 'Änderungsverfahren verbergen'
                    : 'Änderungsverfahren anzeigen'}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </Button>
    </div>
  );
};

export default ShowAEVModeButton;
