import { Math as CeMath } from 'cesium';
interface HighlightOptions {
  digits?: number;
  fixed?: number;
  errorThreshold?: number;
}

// formatter for Cartesian3
export const highlightLocalMeters = (
  num: number,
  { digits = 3, fixed = 4, errorThreshold }: HighlightOptions = {}
) => {
  const [integerPart, decimalPart] = num.toFixed(fixed).split('.');
  const start = integerPart.slice(0, -digits);
  const highlight = integerPart.slice(-digits);

  if (errorThreshold && Math.abs(num) > errorThreshold) {
    return (
      <span style={{ backgroundColor: 'red', color: 'white', fontWeight: 800 }}>
        {integerPart}.{decimalPart}
      </span>
    );
  } else {
    return (
      <>
        {start}
        <span style={{ backgroundColor: 'yellow' }}>{highlight}</span>.
        {decimalPart}
      </>
    );
  }
};

// formatter for Cartographic
export const highlightLocalDegrees = (
  num: number,
  { digits = 4, fixed = 5 }: HighlightOptions = {}
) => {
  // higlight last fractional digits
  const [integerPart, decimalPart] = CeMath.toDegrees(num)
    .toFixed(fixed)
    .split('.');
  const start = decimalPart.slice(0, fixed - digits);
  const highlight = decimalPart.slice(fixed - digits);
  return (
    <>
      {integerPart}.{start}
      <span style={{ backgroundColor: 'yellow' }}>{highlight}</span>
    </>
  );
};

export const formatFractions = (v: number) => {
  if (v >= 1) {
    return `${v.toString()} x`;
  } else {
    const denominator = 1 / v;
    return `1/${denominator}`;
  }
};
