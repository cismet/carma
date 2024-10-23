import React from 'react';
import IconComp from 'react-cismap/commons/Icon';
import { md5FetchJSON, md5FetchText } from 'react-cismap/tools/fetching';
import { getGazDataForTopicIds } from 'react-cismap/tools/gazetteerHelper';

import { host } from './constants';

export const getGazData = async (setGazData) => {
  const prefix = 'GazData';
  const sources = {};

  sources.adressen = await md5FetchText(prefix, host + '/data/adressen.json');
  sources.bezirke = await md5FetchText(prefix, host + '/data/bezirke.json');
  sources.quartiere = await md5FetchText(prefix, host + '/data/quartiere.json');
  sources.pois = await md5FetchText(prefix, host + '/data/pois.json');
  sources.kitas = await md5FetchText(prefix, host + '/data/kitas.json');

  const gazData = getGazDataForTopicIds(sources, [
    'pois',
    'kitas',
    'bezirke',
    'quartiere',
    'adressen',
  ]);

  setGazData(gazData);
};

const hallenbadSVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="20.0" height="20.0">
<path class="fg-fill" fill="#FFF"  d="M0 0h20.008v20.945H0z"/>
<path class="bg-fill" fill="#C32D6A" stroke-width="0" d="M-0 0l20 0 0 10.003c-0.65936,-0.00682 -1.11345,-0.34947 -1.56821,-0.69271 -0.86518,-0.65302 -1.73181,-1.30713 -3.41084,-1.30713 -1.67813,0 -2.54021,0.65234 -3.40228,1.30467 -0.45944,0.34766 -0.9189,0.69533 -1.59773,0.69533 -0.6788,0 -1.13824,-0.34766 -1.59766,-0.69531 -0.86205,-0.65234 -1.72412,-1.30469 -3.40233,-1.30469 -1.67894,0 -2.54581,0.6541 -3.41125,1.30711 -0.4595,0.34672 -0.91827,0.69289 -1.58875,0.69289l0 2.5c1.66756,0 2.5298,-0.65061 3.39343,-1.30227 0.46197,-0.34858 0.92471,-0.69773 1.60657,-0.69773 0.67882,0 1.13824,0.34766 1.59765,0.69531 0.86206,0.65234 1.72414,1.30469 3.40234,1.30469 1.67819,0 2.54032,-0.65236 3.40241,-1.30471 0.45941,-0.34763 0.91884,-0.69529 1.5976,-0.69529 0.68171,0 1.14432,0.34917 1.60616,0.69775 0.85988,0.64903 1.7185,1.29692 3.37289,1.30213l0 3.07371c-0.65936,-0.00682 -1.11345,-0.34947 -1.56821,-0.69271 -0.86518,-0.65302 -1.73181,-1.30713 -3.41084,-1.30713 -1.67813,0 -2.54021,0.65234 -3.40228,1.30467 -0.45944,0.34766 -0.9189,0.69533 -1.59773,0.69533 -0.6788,0 -1.13824,-0.34766 -1.59766,-0.69531 -0.86205,-0.65234 -1.72412,-1.30469 -3.40233,-1.30469 -1.67894,0 -2.54581,0.6541 -3.41125,1.30711 -0.4595,0.34672 -0.91827,0.69289 -1.58875,0.69289l0 2.5c1.66756,0 2.5298,-0.65061 3.39343,-1.30227 0.46197,-0.34858 0.92471,-0.69773 1.60657,-0.69773 0.67882,0 1.13824,0.34766 1.59765,0.69531 0.86206,0.65234 1.72414,1.30469 3.40234,1.30469 1.67819,0 2.54032,-0.65236 3.40241,-1.30471 0.45941,-0.34763 0.91884,-0.69529 1.5976,-0.69529 0.68171,0 1.14432,0.34917 1.60616,0.69775 0.85988,0.64903 1.7185,1.29692 3.37289,1.30213l0 1.92317 -20 0 0 -20z"/>
<polygon class="fg-fill" fill="#FFF" fill-rule="nonzero" points="0.00095,5.53666 9.47805,0.2716 9.96243,0.00251 10.4468,0.2716 20.001,5.57945 20.001,7.85983 9.96243,2.28288 0.00095,7.81704 "/>
</svg>
`;
const freiBadSVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="20.0" height="20.0">
    <path class="fg-fill" fill="#FFF"  d="M0 0h20.008v16.945H0z"/>
    <path class="bg-fill" fill="#C32D6A"  stroke="#C32D6A" stroke-width=".011" 
	d="M0.000900073 0.000610049l20.0016 0 0 5.81939c-0.659583,-0.00680055 -1.11354,-0.349628 -1.56825,-0.692836 -0.8652,-0.653153 -1.73191,-1.30706 -3.41128,-1.30706 -1.67824,0 -2.54042,0.652393 -3.40259,1.30479 -0.459627,0.347748 -0.918874,0.695486 -1.59773,0.695486 -0.678855,0 -1.13847,-0.347738 -1.59772,-0.695486 -0.86218,-0.652393 -1.72435,-1.30479 -3.40259,-1.30479 -1.679,0 -2.54609,0.654283 -3.41166,1.30706 -0.459627,0.346608 -0.918494,0.692836 -1.58904,0.692836l0 2.50034c1.66766,0 2.52982,-0.650503 3.39351,-1.30252 0.461897,-0.348498 0.924925,-0.697757 1.6068,-0.697757 0.678855,0 1.13848,0.347738 1.59772,0.695486 0.86218,0.652393 1.72435,1.30479 3.40259,1.30479 1.67824,0 2.54042,-0.652393 3.40259,-1.30479 0.459627,-0.347748 0.918874,-0.695486 1.59773,-0.695486 0.681875,0 1.14452,0.349258 1.60642,0.697757 0.85991,0.648993 1.71868,1.29685 3.3731,1.30215l0 5.42554c-0.659583,-0.00681055 -1.11353,-0.349638 -1.56825,-0.692846 -0.8652,-0.653153 -1.73191,-1.30706 -3.41128,-1.30706 -1.67824,0 -2.54042,0.652393 -3.40259,1.30479 -0.459627,0.347748 -0.918874,0.695486 -1.59773,0.695486 -0.678845,0 -1.13847,-0.347738 -1.59772,-0.695486 -0.86218,-0.652393 -1.72435,-1.30479 -3.40259,-1.30479 -1.679,0 -2.54609,0.654283 -3.41166,1.30706 -0.459627,0.346608 -0.918494,0.692846 -1.58903,0.692846l0 2.50034c1.66765,0 2.52982,-0.650513 3.3935,-1.30253 0.461897,-0.348498 0.924925,-0.697757 1.6068,-0.697757 0.678855,0 1.13848,0.347748 1.59773,0.695486 0.86217,0.652393 1.72435,1.3048 3.40259,1.3048 1.67824,0 2.54041,-0.652403 3.40259,-1.3048 0.459617,-0.347738 0.918864,-0.695486 1.59772,-0.695486 0.681875,0 1.14453,0.349258 1.60642,0.697757 0.85991,0.648993 1.71868,1.29686 3.3731,1.30215l0 3.75637 -20.0016 0 0 -20.0016 0.000760062 0.000380031z"/>
</svg>
`;

export const getBadSVG = (
  svgSize = 30,
  bg = '#FF0000',
  kind = 'Freibad',
  svgStyleRelatedId = 'default'
) => {
  let bdim = {
    width: 20,
    height: 20,
  };
  let badSVG;
  if (kind === 'Freibad') {
    badSVG = freiBadSVG;
  } else {
    badSVG = hallenbadSVG;
  }
  let svg = `<svg  id="${svgStyleRelatedId}" height="${svgSize}" width="${svgSize}"> 
                    <style>
                    /* <![CDATA[ */
                        #${svgStyleRelatedId} .bg-fill  {
                            fill: ${bg};
                        }
                        #${svgStyleRelatedId} .bg-stroke  {
                            stroke: ${bg};
                        }
                        #${svgStyleRelatedId} .fg-fill  {
                            fill: white;
                        }
                        #${svgStyleRelatedId} .fg-stroke  {
                            stroke: white;
                        }
                    /* ]]> */
                    </style>
                <svg x="${svgSize / bdim.width / 2}" y="${
    svgSize / bdim.height / 2
  }"  width="${svgSize - (2 * svgSize) / bdim.width / 2}" height="${
    svgSize - (2 * svgSize) / bdim.height / 2
  }" viewBox="0 0 ${bdim.width} ${bdim.height || 24}">       
                    ${badSVG}
                </svg>
                </svg>  `;

  return (
    <span
      style={{ width: 'fit-content' }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
};

export const getConnectorImageUrl = (type) => {
  switch (type) {
    case 'Schuko':
      return '/images/emob/Schuko_plug.png';
    case 'Typ 2':
      return '/images/emob/Type_2_mennekes.png';
    case 'CHAdeMO':
      return '/images/emob/Chademo_type4.png';
    case 'CCS':
      return '/images/emob/Type1-ccs.png';
    case 'Tesla Supercharger':
      return '/images/emob/Type_2_mennekes.png';
    case 'Drehstrom':
      return '/images/emob/cce3.png';
    default:
      return undefined;
  }
};

export const getPOIColors = async (setPoiColors) => {
  md5FetchJSON('poi_colors', host + '/data/poi.farben.json').then((data) => {
    setPoiColors(data);
  });
};
