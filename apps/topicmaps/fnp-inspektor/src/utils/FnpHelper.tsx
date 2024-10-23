export const getColorForHauptnutzung = (feature) => {
  const os = parseInt(feature.properties.os);
  let c;
  if (os === 100) {
    c = '#CC1800';
  } else if (os === 200 || os === 220) {
    c = '#7D6666';
  } else if (os === 230) {
    c = '#4C1900';
  } else if (os === 240) {
    c = '#964646';
  } else if (os === 300) {
    c = '#9999A6';
  } else if (os >= 410 && os <= 442) {
    c = '#FF7F00';
  } else if (os >= 1100 && os <= 1900) {
    c = '#AB66AB';
  } else if (os >= 2111 && os <= 2130) {
    c = '#FFCC66';
  } else if (os >= 2141 && os <= 2146) {
    c = '#8C9445';
  } else if (os === 2210 || os === 2220) {
    c = '#7C7CA6';
  } else if (os >= 3110 && os <= 3230) {
    c = '#F2F017';
  } else if (os >= 3300 && os <= 3390) {
    c = '#8CCC33';
  } else if (os === 4010 || os === 4101) {
    c = '#B2FFFF';
  } else if (os === 5000) {
    c = '#D9FF99';
  } else if (os === 5100) {
    c = '#05773C';
  } else if (os === 9999) {
    c = '#FFFFFF';
  } else {
    c = '#000';
  }
  return c;
};

export const getLinkFromAEV = ({
  aevs,
  defaultEl = <div />,
  skipStatus = false,
}) => {
  if (aevs !== undefined && aevs.length > 0) {
    let ret: any = [];
    for (const aev of aevs) {
      let statusText;
      let status = aev.properties.status;
      if (skipStatus === false) {
        if (status === 'r') {
          statusText = '';
        } else if (status === 'n') {
          statusText = ' (nicht rechtswirksam)';
        } else {
          statusText = ' (nicht rechtswirksame Teile)';
        }
      } else {
        statusText = '';
      }
      ret.push(
        <b>
          <a
            href={'/#/docs/aenderungsv/' + aev.text + '/'}
            target="_aenderungsv"
          >
            {aev.text +
              (aev.properties.verfahren === ''
                ? '. FNP-Änderung' + statusText
                : '. FNP-Berichtigung' + statusText)}
          </a>
        </b>
      );
    }
    return ret;
  } else {
    return defaultEl;
  }
};

export const validFNPIcons = [
  '0200.svg',
  '0410.svg',
  '0420.svg',
  '0431.svg',
  '0432.svg',
  '0433.svg',
  '0434.svg',
  '0435.svg',
  '0436.svg',
  '0437.svg',
  '0439.svg',
  '0440.svg',
  '0441.svg',
  '0442.svg',
  '1100.svg',
  '1200.svg',
  '1300.svg',
  '1400.svg',
  '1500.svg',
  '1600.svg',
  '1800.svg',
  '1840.svg',
  '1860.svg',
  '2120.svg',
  '3110.svg',
  '3115.svg',
  '3120.svg',
  '3140.svg',
  '3210.svg',
  '3220.svg',
  '3221.svg',
  '3222.svg',
  '3223.svg',
  '3230.svg',
  '3310.svg',
  '3320.svg',
  '3330.svg',
  '3341.svg',
  '3342.svg',
  '3343.svg',
  '3344.svg',
  '3345.svg',
  '3346.svg',
  '3360.svg',
  '3370.svg',
  '3382.svg',
  '3390.svg',
  '4101.svg',
];
