import ResponsiveInfoBox, {
  MODES,
} from 'react-cismap/topicmaps/ResponsiveInfoBox';
import Icon from 'react-cismap/commons/Icon';
import { UIDispatchContext } from 'react-cismap/contexts/UIContextProvider';
import { useContext } from 'react';

const EmptyHNInfo = () => {
  const { setAppMenuVisible } = useContext<UIDispatchContext>(UIDispatchContext);
  let divWhenLarge = (
    <div>
      <h4>Hinweise</h4>
      <p>
        Doppelklick in Karte für Auswahl einer Hauptnutzungsfläche und Anzeige
        der Flächeninformation | Flächenauswahl über Änderungsverfahren (ÄV)
        oder B-Plan durch Eingabe der ÄV- oder B-Plan-Nummer im Suchfeld und
        Auswahl [<Icon name="file" overlay="F" marginRight="2px" />,{' '}
        <Icon name="file" overlay="B" marginRight="2px" />] aus Vorschlagsliste{' '}
        <a style={{ color: '#0078A8' }} onClick={() => setAppMenuVisible(true)}>
          <Icon name="angle-double-right" /> Kompaktanleitung
        </a>
      </p>
    </div>
  );

  let divWhenCollapsed = (
    <div>
      <table border={0} style={{ width: '100%' }}>
        <tbody>
          <tr>
            <td
              style={{
                textAlign: 'left',
                verticalAlign: 'top',

                maxWidth: '160px',
                overflowWrap: 'break-word',
              }}
            >
              <h4>Hinweise ...</h4>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );

  return (
    <ResponsiveInfoBox
      pixelwidth={350}
      //   header={llVis}
      mode={MODES.AB}
      divWhenLarge={divWhenLarge}
      divWhenCollapsed={divWhenCollapsed}
    ></ResponsiveInfoBox>
  );
};

export default EmptyHNInfo;
