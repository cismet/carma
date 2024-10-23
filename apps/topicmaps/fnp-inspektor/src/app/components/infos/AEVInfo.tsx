import ResponsiveInfoBox, {
  MODES,
} from 'react-cismap/topicmaps/ResponsiveInfoBox';
import { useDispatch, useSelector } from 'react-redux';
import {
  getFeatureCollection,
  getSelectedFeatureIndex,
  setFeatureCollection,
  setSelectedFeatureIndex,
} from '../../../store/slices/mapping';
import L from 'leaflet';
import Icon from 'react-cismap/commons/Icon';
import { TopicMapContext } from 'react-cismap/contexts/TopicMapContextProvider';
import { useContext } from 'react';

const AEVInfo = () => {
  const features = useSelector(getFeatureCollection);
  const selectedFeatureIndex = useSelector(getSelectedFeatureIndex);
  const currentFeature = features[selectedFeatureIndex];
  const dispatch = useDispatch();
  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);

  const next = () => {
    let potIndex = selectedFeatureIndex + 1;
    if (potIndex >= features.length) {
      potIndex = 0;
    }
    dispatch(setSelectedFeatureIndex(potIndex));
  };

  const prev = () => {
    let potIndex = selectedFeatureIndex - 1;
    if (potIndex < 0) {
      potIndex = features.length - 1;
    }
    dispatch(setSelectedFeatureIndex(potIndex));
  };

  let hasMainDocument =
    currentFeature.properties.url !== undefined &&
    currentFeature.properties.url !== null &&
    currentFeature.properties.url.trim() !== '';
  let urlPrefix = window.location.origin + window.location.pathname;
  let target = '_docviewer';
  let docOrDocs;
  let mainDocOrDocs;
  if (currentFeature.properties.docUrls.length > 0) {
    mainDocOrDocs = 'Dokumente';
    if (currentFeature.properties.docUrls.length > 1) {
      docOrDocs = 'Zusatzdokumenten';
    } else {
      docOrDocs = 'Zusatzdokument';
    }
  } else {
    mainDocOrDocs = 'Dokument';
  }

  let zusatzdokumente = '';
  if (currentFeature.properties.docUrls.length > 0) {
    zusatzdokumente =
      ' mit ' + currentFeature.properties.docUrls.length + ' ' + docOrDocs;
  }

  let status = currentFeature.properties.status;
  //let rk=(<FontAwesome name='check-circle-o' />);

  let statusText, headerColor;
  if (status === 'r') {
    statusText = 'rechtswirksam';
    headerColor = '#82BB8F';
  } else if (status === 'n') {
    statusText = 'nicht rechtswirksam';
    headerColor = '#F48286';
  } else {
    statusText = 'rechtswirksam mit nicht rechtswirksamem Teilen';
    headerColor = '#F48286';
  }

  let rechtswirksam_seit;

  if (currentFeature.properties.rechtswirk !== undefined) {
    const [y, m, d] = currentFeature.properties.rechtswirk.split('-');

    rechtswirksam_seit = d + '.' + m + '.' + y;
  }

  const bpl = currentFeature.properties.bplan_nr || '';
  const bplArr = bpl.split('+');
  const linkArr: any = [];
  bplArr.forEach((nr, index) => {
    linkArr.push(
      <span key={'bpl.' + index}>
        <a
          href={
            'https://carma-dev-deployments.github.io/topicmaps-bplan-auskunft-wuppertal/' +
            `#/docs/${nr}/1/1`
          }
          target={target}
        >
          B-Plan {nr}
        </a>
        {index < bplArr.length - 1 ? ', ' : ''}
      </span>
    );
  });

  let divWhenLarge = (
    <div>
      <table border={0} style={{ width: '100%' }}>
        <tbody>
          <tr>
            <td
              style={{
                textAlign: 'left',
                verticalAlign: 'top',
                padding: '5px',
                maxWidth: '180px',
                overflowWrap: 'break-word',
              }}
            >
              <h4>
                {currentFeature.text}
                {currentFeature.properties.verfahren === ''
                  ? '. FNP-Änderung'
                  : '. FNP-Berichtigung'}
              </h4>
              {currentFeature.properties.bplan_nr !== undefined && (
                <h6>
                  <b>Anlass: {linkArr} </b>
                </h6>
              )}
              {rechtswirksam_seit !== undefined && (
                <h6>
                  <b>rechtswirksam seit:</b> {rechtswirksam_seit}
                </h6>
              )}
            </td>
            <td
              style={{
                textAlign: 'center',
                verticalAlign: 'top',
                padding: '5px',
                paddingTop: '1px',
              }}
            >
              {hasMainDocument === true && (
                <a
                  style={{ color: '#333' }}
                  href={urlPrefix + `/#/docs/${currentFeature.text}/1/1`}
                  target={target}
                >
                  <h4
                    style={{
                      marginLeft: 5,
                      marginRight: 5,
                      marginBottom: '4px',
                    }}
                  >
                    <Icon
                      style={{ textDecoration: 'none' }}
                      name="file-pdf-o"
                    />
                  </h4>

                  <strong>{mainDocOrDocs}</strong>
                </a>
              )}
            </td>
          </tr>
        </tbody>
      </table>

      <div style={{ height: '9px' }} />
      <table style={{ width: '100%', color: '#0078A8' }}>
        <tbody>
          <tr>
            <td style={{ textAlign: 'left', verticalAlign: 'center' }}>
              <a title="vorheriger Treffer" onClick={prev}>
                &lt;&lt;
              </a>
            </td>

            <td style={{ textAlign: 'center', verticalAlign: 'center' }}>
              <a
                onClick={() => {
                  const projectedFC = L.Proj.geoJson(features);
                  const bounds = projectedFC.getBounds();
                  const map = routedMapRef?.leafletMap?.leafletElement;
                  if (map === undefined) {
                    return;
                  }
                  map.fitBounds(bounds);
                }}
              >
                alle {features.length} Treffer anzeigen
              </a>
            </td>
            <td style={{ textAlign: 'right', verticalAlign: 'center' }}>
              <a title="nächster Treffer" onClick={next}>
                &gt;&gt;
              </a>
            </td>
          </tr>
        </tbody>
      </table>
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
                padding: '5px',
                maxWidth: '160px',
                overflowWrap: 'break-word',
              }}
            >
              <h4>
                {currentFeature.properties.verfahren === ''
                  ? 'FNP-Änderung'
                  : 'FNP-Berichtigung'}{' '}
                {currentFeature.text}
              </h4>
            </td>
            <td
              style={{
                textAlign: 'center',
                verticalAlign: 'center',
                padding: '5px',
                paddingTop: '1px',
              }}
            >
              {hasMainDocument === true && (
                <a
                  style={{ color: '#333' }}
                  href={`/#/docs/aenderungsv/${currentFeature.text}/1`}
                  target="_aenderungsv"
                >
                  <h4 style={{ marginLeft: 5, marginRight: 5 }}>
                    <Icon
                      style={{ textDecoration: 'none', fontSize: 26 }}
                      name="file-pdf-o"
                    />
                  </h4>
                </a>
              )}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );

  let llVis = (
    <table style={{ width: '100%' }}>
      <tbody>
        <tr>
          <td
            style={{
              textAlign: 'left',
              verticalAlign: 'top',
              background: headerColor,
              color: 'black',
              opacity: '0.9',
              paddingLeft: '3px',
              paddingTop: '0px',
              paddingBottom: '0px',
            }}
          >
            {statusText}
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

export default AEVInfo;
