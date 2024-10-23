// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { useDispatch, useSelector } from 'react-redux';
import { colorChanged } from '../../utils/kassenzeichenHelper';
import {
  fitFeatureBounds,
  getMapping,
  setSelectedFeatureIndexWithSelector,
} from '../../store/slices/mapping';

interface FlaechenPanelProps {
  flaeche: any;
  selected: boolean;
}

const FlaechenPanel = ({ flaeche, selected }: FlaechenPanelProps) => {
  let background = '';
  let groesse,
    groesseColor = 'black',
    anteil,
    anschlussgrad,
    anschlussgradColor = 'black',
    flaechenart,
    flaechenartColor = 'black',
    editButtonColor;
  let borderStyle = '';
  let borderColor = '';
  const mapping = useSelector(getMapping);
  const dispatch = useDispatch();

  const isFlaecheSelected = (flaeche) => {
    return (
      mapping.featureCollection !== 'undefined' &&
      mapping.featureCollection.length > 0 &&
      mapping.selectedIndex !== 'undefined' &&
      mapping.featureCollection.length > mapping.selectedIndex &&
      mapping.featureCollection[mapping.selectedIndex] &&
      mapping.featureCollection[mapping.selectedIndex]?.properties.id ===
        flaeche.id
    );
  };

  const featureClick = (event) => {
    const feature = mapping.featureCollection.find((feature) => {
      return feature.properties.id === flaeche.id;
    });

    if (isFlaecheSelected(feature.properties)) {
      dispatch(
        fitFeatureBounds(mapping.featureCollection[mapping.selectedIndex], '')
      );
    } else {
      dispatch(
        setSelectedFeatureIndexWithSelector((testFeature) => {
          return testFeature.properties.id === feature.properties.id;
        })
      );
    }
  };

  if (selected) {
    borderStyle = 'solid';
    borderColor = colorChanged;
  } else {
    borderStyle = 'solid';
    borderColor = '#ffffff00';
  }
  let styleOverride = {
    marginBottom: '5px',
    width: '100%',
    height: '100%',
    background: background,
    borderStyle: borderStyle,
    borderColor: borderColor,
    borderWidth: 3,
  };

  groesse = flaeche.flaecheninfo.groesse_korrektur;
  anteil = flaeche.anteil;
  anschlussgrad = flaeche.flaecheninfo.anschlussgrad.grad_abkuerzung;
  flaechenart = flaeche.flaecheninfo.flaechenart.art;

  let area = <div />;
  if (flaeche.anteil) {
    area = (
      <div style={{ color: groesseColor }}>
        {anteil} m&sup2; von {groesse} m&sup2;
      </div>
    );
  } else {
    area = <div style={{ color: groesseColor }}>{groesse} m&sup2;</div>;
  }

  let beschreibung = <div />;
  if (flaeche.flaecheninfo.beschreibung) {
    beschreibung = <div>{flaeche.flaecheninfo.beschreibung.beschreibung}</div>;
  }

  return (
    <div>
      <div
        onClick={featureClick}
        style={{
          ...styleOverride,
          minHeight: 20,
          backgroundColor: '#f5f5f5',
          border: '1px solid #e3e3e3',
          padding: 9,
          borderRadius: 3,
          height: 'auto',
        }}
      >
        <table style={{ width: '100%' }}>
          <tbody>
            <tr>
              <td>
                <b style={{ color: flaechenartColor }}>
                  {flaechenart + ' ' + flaeche.flaechenbezeichnung}
                </b>
              </td>
              <td style={{ textAlign: 'right' }}>{beschreibung}</td>

              {/* {this.props.editmode === true && (
                            <td
                                style={{
                                    textAlign: "right",
                                    color: editButtonColor,
                                    cursor: "pointer"
                                }}
                            >
                                <Icon
                                    onClick={e => {
                                        this.props.showEditCRMenu(this.props.flaeche);
                                        e.stopPropagation();
                                    }}
                                    icon={faEdit}
                                />
                            </td>
                        )} */}
            </tr>
            <tr>
              <td>{area}</td>
              <td style={{ textAlign: 'right', color: anschlussgradColor }}>
                {anschlussgrad}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default FlaechenPanel;
