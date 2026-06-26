export const formatFractions = (v: number) => {
  if (v >= 1) {
    return `${v.toString()} x`;
  } else {
    const denominator = 1 / v;
    return `1/${denominator}`;
  }
};
