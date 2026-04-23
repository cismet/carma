import { PI_OVER_FOUR, zeroToTwoPi, type Radians } from "@carma-units";

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
    short: ["N", "NO", "O", "SO", "S", "SW", "W", "NW"],
    long: ["Nord", "Nordost", "Ost", "Südost", "Süd", "Südwest", "West", "Nordwest"],
  },
  en: {
    short: ["N", "NE", "E", "SE", "S", "SW", "W", "NW"],
    long: [
      "North",
      "Northeast",
      "East",
      "Southeast",
      "South",
      "Southwest",
      "West",
      "Northwest",
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
  }: {
    locale?: CardinalBearingLocale;
    form?: CardinalBearingForm;
  } = {}
): string => {
  const normalizedBearingRad = zeroToTwoPi(bearingRad as Radians);
  const directionIndex =
    Math.round(normalizedBearingRad / PI_OVER_FOUR) %
    cardinalBearingLabels[locale][form].length;
  return cardinalBearingLabels[locale][form][directionIndex]!;
};
