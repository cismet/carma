import ResponsiveInfoBox, {
  MODES,
} from 'react-cismap/topicmaps/ResponsiveInfoBox';
import { useSelector } from 'react-redux';
import {
  getFeatureCollection,
  getSelectedFeatureIndex,
} from '../../../store/slices/mapping';
import Color from 'color';
import {
  getColorForHauptnutzung,
  getLinkFromAEV,
  validFNPIcons,
} from '../../../utils/FnpHelper';

const HNInfo = () => {
  let paddingTop = 9;
  let margin = 9;
  const features = useSelector(getFeatureCollection);
  const selectedFeatureIndex = useSelector(getSelectedFeatureIndex);
  const selectedFeature = features[selectedFeatureIndex];

  let name = selectedFeature.text;
  const datetimeParts = (selectedFeature.properties.rechtswirksam || '').split(
    ' '
  );
  const dateParts = datetimeParts[0].split('-');
  const date = dateParts[2] + '.' + dateParts[1] + '.' + dateParts[0];

  const nameParts = name.split('-');
  let infoText;
  let oberbegriff;

  if (nameParts.length === 1) {
    infoText = name;
    oberbegriff = name;
  } else if (nameParts.length === 2) {
    oberbegriff = nameParts[0];
    infoText = nameParts[1];
  } else {
    //>2
    oberbegriff = nameParts[0] + ' - ' + nameParts[1];
    nameParts.shift(); //erstes Element Weg
    nameParts.shift(); //zweites Element Weg
    infoText = nameParts.join('-');
  }

  const headerText = oberbegriff;
  const os = selectedFeature.properties.os;

  const festgelegt = getLinkFromAEV({
    aevs: selectedFeature.properties.fnp_aender,
    defaultEl: <span>FNP vom 17.01.2005</span>,
  });

  if (selectedFeature.properties.area > 0) {
    infoText = (
      <div>
        <span>{infoText + ' '}</span>
        <span style={{ whiteSpace: 'nowrap' }}>
          {'(' +
            (selectedFeature.properties.area + '').replace('.', ',') +
            ' ha)'}
        </span>
      </div>
    );
  } else if (selectedFeature.properties.area === 0) {
    infoText = (
      <div>
        <span>{infoText + ' '}</span>
        <span style={{ whiteSpace: 'nowrap' }}>({'<'} 0,1 ha)</span>
      </div>
    );
  }

  let icon;
  if (validFNPIcons.indexOf(os + '.svg') !== -1) {
    icon = (
      <img
        alt=""
        style={{
          borderColor: 'black',
          padding: 4,
          float: 'right',
          maxWidth: '80px',
        }}
        src={'/images/fnp/' + os + '.svg'}
      />
    );
  }

  let sieheAuchLinks: any = undefined;
  if (selectedFeature.properties.siehe_auch_aev !== undefined) {
    sieheAuchLinks = getLinkFromAEV({
      aevs: selectedFeature.properties.siehe_auch_aev,
      skipStatus: true,
    });
  }

  let divWhenLarge = (
    <div style={{ padding: 9 }}>
      {icon}
      <h4 style={{ wordWrap: 'break-word' }}>{infoText}</h4>
      <p>
        <b>rechtswirksam seit: </b>
        {date}
      </p>

      <p>
        <b>festgelegt durch:</b> {festgelegt}
      </p>
      {sieheAuchLinks !== undefined && (
        <p>
          <b>s. auch:</b>{' '}
          {sieheAuchLinks.length > 1 &&
            sieheAuchLinks.map((comp, index) => {
              if (index < sieheAuchLinks.length - 1) {
                return <span>{comp}, </span>;
              } else {
                return <span>{comp} (jeweils nicht rechtswirksam)</span>;
              }
            })}
          {sieheAuchLinks.length === 1 &&
            sieheAuchLinks.map((comp, index) => {
              return <span>{comp} (nicht rechtswirksam)</span>;
            })}
        </p>
      )}
      {selectedFeature.properties.bplan_nr !== undefined && (
        <p>
          <b>Anlass: </b>{' '}
          <b>
            <a
              href={'/#/docs/bplaene/' + selectedFeature.properties.bplan_nr}
              target="_bplaene"
            >
              B-Plan {selectedFeature.properties.bplan_nr}
            </a>
          </b>
        </p>
      )}
    </div>
  );

  let divWhenCollapsed = (
    <div style={{ paddingLeft: 9, paddingRight: 9 }}>
      {icon}
      <div style={{ paddingTop, paddingBottom: paddingTop }}>
        <h4 style={{ verticalAlign: 'middle', margin }}>{infoText}</h4>
      </div>
    </div>
  );

  let headerBackgroundColor = Color(getColorForHauptnutzung(selectedFeature));

  let llVis = (
    <table style={{ width: '100%' }}>
      <tbody>
        <tr>
          <td
            style={{
              textAlign: 'left',
              verticalAlign: 'top',
              background: headerBackgroundColor,
              color: 'black',
              opacity: '0.9',
              paddingLeft: '3px',
              paddingTop: '0px',
              paddingBottom: '0px',
            }}
          >
            {headerText}
          </td>
        </tr>
      </tbody>
    </table>
  );

  return (
    <ResponsiveInfoBox
      pixelwidth={350}
      header={llVis}
      mode={MODES.AB}
      divWhenLarge={divWhenLarge}
      divWhenCollapsed={divWhenCollapsed}
    ></ResponsiveInfoBox>
  );
};

export default HNInfo;
