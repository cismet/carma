import { TWO_PI, zeroToTwoPi, type Radians } from "@carma-units";

export const CARDINAL_BEARING_LOCALE = {
  DE: "de",
  EN: "en",
} as const;

export type CardinalBearingLocale =
  (typeof CARDINAL_BEARING_LOCALE)[keyof typeof CARDINAL_BEARING_LOCALE];

export const CARDINAL_BEARING_FORM = {
  SHORT: "short",
  LONG: "long",
} as const;

export type CardinalBearingForm =
  (typeof CARDINAL_BEARING_FORM)[keyof typeof CARDINAL_BEARING_FORM];

const cardinalBearingLabels = {
  de: {
    short: [
      "N",
      "NNO",
      "NO",
      "ONO",
      "O",
      "OSO",
      "SO",
      "SSO",
      "S",
      "SSW",
      "SW",
      "WSW",
      "W",
      "WNW",
      "NW",
      "NNW",
    ],
    long: [
      "Nord",
      "Nordnordost",
      "Nordost",
      "Ostnordost",
      "Ost",
      "Ostsüdost",
      "Südost",
      "Südsüdost",
      "Süd",
      "Südsüdwest",
      "Südwest",
      "Westsüdwest",
      "West",
      "Westnordwest",
      "Nordwest",
      "Nordnordwest",
    ],
  },
  en: {
    short: [
      "N",
      "NNE",
      "NE",
      "ENE",
      "E",
      "ESE",
      "SE",
      "SSE",
      "S",
      "SSW",
      "SW",
      "WSW",
      "W",
      "WNW",
      "NW",
      "NNW",
    ],
    long: [
      "North",
      "North-northeast",
      "Northeast",
      "East-northeast",
      "East",
      "East-southeast",
      "Southeast",
      "South-southeast",
      "South",
      "South-southwest",
      "Southwest",
      "West-southwest",
      "West",
      "West-northwest",
      "Northwest",
      "North-northwest",
    ],
  },
} as const satisfies Record<
  CardinalBearingLocale,
  Record<CardinalBearingForm, readonly string[]>
>;

export const formatCardinalBearing = (
  bearingRad: number,
  {
    locale = CARDINAL_BEARING_LOCALE.DE,
    form = CARDINAL_BEARING_FORM.LONG,
    points = 8,
  }: {
    locale?: CardinalBearingLocale;
    form?: CardinalBearingForm;
    /** Number of equally spaced compass directions. */
    points?: 8 | 16;
  } = {}
): string => {
  const normalizedBearingRad = zeroToTwoPi(bearingRad as Radians);
  const directionIndex =
    Math.round(normalizedBearingRad / (TWO_PI / points)) % points;
  return cardinalBearingLabels[locale][form][directionIndex * (16 / points)]!;
};
