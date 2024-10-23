import React from 'react';
export const host = 'https://wupp-topicmaps-data.cismet.de';

export const LOOKUP = {
  abgebaut: {
    color: '#9DBCCC',
    signature: 'Luft_Icon_Messstation_abgebaut_farbig.svg',
    header: 'Messstation für NO₂ (inaktiv, abmontiert)',
    title: 'abmontiert',
    filterTitle: 'abmontierte',
  },
  inaktiv: {
    color: '#4FAFC5',
    signature: 'Luft_Icon_Messstation_deaktiv_farbig.svg',
    header: 'Messstation für NO₂ (aktiv, aktuell Messausfall)',
    title: 'inaktiv',
    filterTitle: 'Messstationsausfälle',
  },
  unauffaellig: {
    color: '#9ACD32',
    signature: 'Luft_Icon_Messstation_unauffaellig_farbig.svg',
    header: 'Messstation für NO₂ (aktiv, unauffällig)',
    title: 'unauffällig',
    filterTitle: 'unauffällige',
  },
  auffaellig: {
    color: '#FFA500',
    signature: 'Luft_Icon_Messstation_auffaellig_farbig.svg',
    header: 'Messstation für NO₂ (aktiv, auffällig)',
    title: 'auffällig',
    filterTitle: 'auffällige',
  },
  warnend: {
    color: '#E01414',
    signature: 'Luft_Icon_Messstation_warnend_farbig.svg',
    header: 'Messstation für NO₂ (aktiv, warnend)',
    title: 'warnend',
    filterTitle: 'warnende',
  },
  unknown: { color: '#eeeeee', signature: 'Platz.svg', header: 'Fehler' },
};

export const MONTHS = [
  { name: 'Januar', shortname: 'Jan.' },
  { name: 'Februar', shortname: 'Feb.' },
  { name: 'März', shortname: 'Mär.' },
  { name: 'April', shortname: 'Apr.' },
  { name: 'Mai', shortname: 'Mai.' },
  { name: 'Juni', shortname: 'Jun.' },
  { name: 'Juli', shortname: 'Jul.' },
  { name: 'August', shortname: 'Aug.' },
  { name: 'September', shortname: 'Sep.' },
  { name: 'Oktober', shortname: 'Okt.' },
  { name: 'November', shortname: 'Nov.' },
  { name: 'Dezember', shortname: 'Dez.' },
];

const openDataIntro = (
  <span>
    Die Daten dieser Luftmessstation sind im Open-Data-Portal der Stadt
    Wuppertal verfügbar:
  </span>
);
export const opendataLinkSections = [
  <div>
    {openDataIntro}
    <ul>
      <li>
        <a
          target="_opendata"
          href="https://offenedaten-wuppertal.de/dataset/luftmessstationen-wuppertal-passivsammler"
        >
          Stammdaten der Luftmessstationen
        </a>
      </li>
      <li>
        <a
          target="_opendata"
          href="https://offenedaten-wuppertal.de/dataset/no2-messdaten-wuppertal-passivsammler-2006-und-2007"
        >
          Messwerte und Jahresmittelwerte 2006/2007
        </a>
      </li>
    </ul>
  </div>,
  <div>
    {openDataIntro}
    <ul>
      <li>
        <a
          target="_opendata"
          href="https://offenedaten-wuppertal.de/dataset/luftmessstationen-wuppertal-passivsammler"
        >
          Stammdaten der Luftmessstationen
        </a>
      </li>
      <li>
        <a
          target="_opendata"
          href="https://offenedaten-wuppertal.de/dataset/no2-messdaten-wuppertal-passivsammler-2006-und-2007"
        >
          Messwerte und Jahresmittelwerte 2006/2007
        </a>
      </li>
      <li>
        <a
          target="_opendata"
          href="https://offenedaten-wuppertal.de/dataset/no2-messdaten-wuppertal-passivsammler-ab-2008"
        >
          NO₂-Messwerte seit 2008
        </a>
      </li>
      <li>
        <a
          target="_opendata"
          href="https://offenedaten-wuppertal.de/dataset/no2-jahresmittelwerte-wuppertal-passivsammler-ab-2008"
        >
          Jahresmittelwerte seit 2008
        </a>
      </li>
    </ul>
  </div>,
  <div>
    {openDataIntro}
    <ul>
      <li>
        <a
          target="_opendata"
          href="https://offenedaten-wuppertal.de/dataset/luftmessstationen-wuppertal-passivsammler"
        >
          Stammdaten der Luftmessstationen
        </a>
      </li>
      <li>
        <a
          target="_opendata"
          href="https://offenedaten-wuppertal.de/dataset/no2-messdaten-wuppertal-passivsammler-ab-2008"
        >
          NO₂-Messwerte seit 2008
        </a>
      </li>
      <li>
        <a
          target="_opendata"
          href="https://offenedaten-wuppertal.de/dataset/no2-jahresmittelwerte-wuppertal-passivsammler-ab-2008"
        >
          Jahresmittelwerte seit 2008
        </a>
      </li>
    </ul>
  </div>,
  <div>
    {openDataIntro}
    <ul>
      <li>
        <a
          target="_opendata"
          href="https://offenedaten-wuppertal.de/dataset/luftmessstationen-wuppertal-passivsammler"
        >
          Stammdaten der Luftmessstationen
        </a>
      </li>

      <li>
        <a
          target="_opendata"
          href="https://offenedaten-wuppertal.de/dataset/no2-messdaten-wuppertal-passivsammler-ab-2008"
        >
          NO₂-Messwerte seit 2008
        </a>
      </li>
      <li>
        <a
          target="_opendata"
          href="https://offenedaten-wuppertal.de/dataset/no2-jahresmittelwerte-wuppertal-passivsammler-ab-2008"
        >
          Jahresmittelwerte seit 2008
        </a>
      </li>
    </ul>
  </div>,
];
