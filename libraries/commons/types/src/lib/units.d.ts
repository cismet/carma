// Branded unit types (dimensionless numeric brands)
declare const degreesBrand: unique symbol;
declare const radiansBrand: unique symbol;
declare const metersBrand: unique symbol;

export type Degrees = number & { readonly [degreesBrand]: true };
export type Radians = number & { readonly [radiansBrand]: true };
export type Meters = number & { readonly [metersBrand]: true };
