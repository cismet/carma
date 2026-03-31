import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Meta, StoryObj } from "@storybook/react";
import { Button, Radio } from "antd";

import { ResponsiveStatusBar } from "@carma-commons/ui/components";
import {
  FORMAT_LOCALE,
  GEOGRAPHIC_DIRECTION_STYLE,
  formatLatLonDegrees,
  type GeographicDirectionStyle,
  type GeographicFractionDigits,
} from "@carma/units/helpers";
import type { Degrees } from "@carma/units/types";
type GeographicCardinalFormatterStoryProps = {
  latitudeDeg: number;
  longitudeDeg: number;
  fractionDigits: GeographicFractionDigits;
  locale: string;
  directionStyle: GeographicDirectionStyle;
  unitSymbol?: string | false;
};

type FormatterOptions = {
  locale: string;
  directionStyle: GeographicDirectionStyle;
  unitSymbol?: string | false;
  fractionDigits: GeographicFractionDigits;
};

type EdgeCase = {
  label: string;
  latitudeDeg: number;
  longitudeDeg: number;
};

type QuadrantSample = {
  id: string;
  label: string;
  latitudeDeg: number;
  longitudeDeg: number;
};

const ALL_DIRECTION_STYLES = [
  GEOGRAPHIC_DIRECTION_STYLE.CARDINAL,
  GEOGRAPHIC_DIRECTION_STYLE.SIGNED,
] as const;

const EDGE_CASES: readonly EdgeCase[] = [
  { label: "origin", latitudeDeg: 0, longitudeDeg: 0 },
  { label: "north-east limit", latitudeDeg: 90, longitudeDeg: 180 },
  { label: "south-west limit", latitudeDeg: -90, longitudeDeg: -180 },
  { label: "anti-meridian west", latitudeDeg: 12.5, longitudeDeg: -180 },
  { label: "anti-meridian east", latitudeDeg: -12.5, longitudeDeg: 180 },
  {
    label: "precision near zero",
    latitudeDeg: -0.000001,
    longitudeDeg: 0.000001,
  },
] as const;

const INTERACTIVE_QUADRANTS = [
  { id: "ne", label: "north-east", latSign: 1, lngSign: 1 },
  { id: "nw", label: "north-west", latSign: 1, lngSign: -1 },
  { id: "se", label: "south-east", latSign: -1, lngSign: 1 },
  { id: "sw", label: "south-west", latSign: -1, lngSign: -1 },
] as const;

const MATRIX_BASE_COORDINATES = {
  latitudeDeg: -51.25609,
  longitudeDeg: -7.1761,
} as const;

const RANDOM_UPDATE_INTERVAL_MS = 2000;
const TABLE_FONT_FAMILY =
  'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

const tableCellStyle = {
  padding: "8px 10px",
  borderBottom: "1px solid rgba(226, 232, 240, 0.9)",
  verticalAlign: "top",
} as const;

const tableHeaderCellStyle = {
  padding: "10px 10px",
  borderBottom: "1px solid rgba(148, 163, 184, 0.45)",
  background: "rgba(241, 245, 249, 0.96)",
  color: "#334155",
  textAlign: "left" as const,
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase" as const,
  whiteSpace: "nowrap" as const,
} as const;

const sectionHeaderCellStyle = {
  ...tableHeaderCellStyle,
  background: "rgba(226, 232, 240, 0.92)",
  color: "#1e293b",
  fontSize: 13,
  textTransform: "none" as const,
  letterSpacing: "0.02em",
} as const;

const tableShellStyle = {
  width: "100%",
  overflowX: "auto" as const,
  display: "flex",
  justifyContent: "center",
} as const;

const tableStyle = {
  width: "max-content",
  maxWidth: "100%",
  borderCollapse: "collapse" as const,
  background: "rgba(255, 255, 255, 0.78)",
  fontSize: 13,
  color: "#0f172a",
} as const;

const formatInputNumber = (value: number) =>
  Number.isFinite(value)
    ? value
        .toFixed(6)
        .replace(/(\.\d*?[1-9])0+$/u, "$1")
        .replace(/\.0+$/u, "")
    : "unresolved";

const buildFormatterOutput = (
  latitudeDeg: number,
  longitudeDeg: number,
  options: FormatterOptions
) => {
  const [latitude, longitude] = formatLatLonDegrees(
    latitudeDeg as Degrees,
    longitudeDeg as Degrees,
    {
      fractionDigits: options.fractionDigits,
      locale: options.locale,
      directionStyle: options.directionStyle,
      unitSymbol: options.unitSymbol,
    }
  );

  return { latitude, longitude };
};

const createQuadrantRandomValue = (sign: 1 | -1, maxAbs: number): number => {
  const magnitude = Math.max(0.000001, Math.random() * maxAbs);
  return magnitude * sign;
};

const createQuadrantSamples = (): QuadrantSample[] =>
  INTERACTIVE_QUADRANTS.map((quadrant) => ({
    id: quadrant.id,
    label: quadrant.label,
    latitudeDeg: createQuadrantRandomValue(quadrant.latSign, 90),
    longitudeDeg: createQuadrantRandomValue(quadrant.lngSign, 180),
  }));

const FormatterPreview = ({
  latitudeDeg,
  longitudeDeg,
  fractionDigits,
  locale,
  directionStyle,
  unitSymbol,
}: GeographicCardinalFormatterStoryProps) => {
  const [localLocale, setLocalLocale] = useState(locale);
  const [interactiveSamples, setInteractiveSamples] = useState<
    QuadrantSample[] | null
  >(null);
  const [isRandomizing, setIsRandomizing] = useState(false);
  const randomIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    setLocalLocale(locale);
  }, [locale]);

  const interactiveOptions = useMemo(
    () =>
      ({
        locale: localLocale,
        directionStyle,
        unitSymbol,
        fractionDigits,
      } satisfies FormatterOptions),
    [directionStyle, fractionDigits, localLocale, unitSymbol]
  );

  const resolvedInteractiveSamples = useMemo<QuadrantSample[]>(
    () =>
      interactiveSamples ?? [
        {
          id: "ne",
          label: "north-east",
          latitudeDeg: Math.abs(latitudeDeg),
          longitudeDeg: Math.abs(longitudeDeg),
        },
        {
          id: "nw",
          label: "north-west",
          latitudeDeg: Math.abs(latitudeDeg),
          longitudeDeg: -Math.abs(longitudeDeg),
        },
        {
          id: "se",
          label: "south-east",
          latitudeDeg: -Math.abs(latitudeDeg),
          longitudeDeg: Math.abs(longitudeDeg),
        },
        {
          id: "sw",
          label: "south-west",
          latitudeDeg: -Math.abs(latitudeDeg),
          longitudeDeg: -Math.abs(longitudeDeg),
        },
      ],
    [interactiveSamples, latitudeDeg, longitudeDeg]
  );

  const stopRandomUpdates = useCallback(() => {
    if (randomIntervalRef.current !== null) {
      window.clearInterval(randomIntervalRef.current);
      randomIntervalRef.current = null;
    }
    setIsRandomizing(false);
    setInteractiveSamples(null);
  }, []);

  const startRandomUpdates = useCallback(() => {
    if (randomIntervalRef.current !== null) {
      window.clearInterval(randomIntervalRef.current);
    }

    setIsRandomizing(true);
    setInteractiveSamples(createQuadrantSamples());
    randomIntervalRef.current = window.setInterval(() => {
      setInteractiveSamples(createQuadrantSamples());
    }, RANDOM_UPDATE_INTERVAL_MS);
  }, []);

  useEffect(() => stopRandomUpdates, [stopRandomUpdates]);

  const statusValues = useMemo(
    () => [
      `digits ${
        typeof fractionDigits === "number"
          ? fractionDigits
          : `lat ${fractionDigits.lat ?? "default"} / lon ${
              fractionDigits.lon ?? "default"
            }`
      }`,
      `direction ${directionStyle}`,
      `locale ${localLocale}`,
      `unit ${unitSymbol === false ? "none" : unitSymbol ?? "°"}`,
      `interactive ${isRandomizing ? "randomizing" : "idle"}`,
      `${EDGE_CASES.length} edge cases`,
    ],
    [directionStyle, fractionDigits, isRandomizing, localLocale, unitSymbol]
  );

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f8fafc",
        fontFamily: TABLE_FONT_FAMILY,
      }}
    >
      <div style={{ position: "sticky", top: 0, zIndex: 10 }}>
        <ResponsiveStatusBar label="geo formatter" values={statusValues} />
      </div>

      <div
        style={{
          maxWidth: 1680,
          margin: "0 auto",
          padding: "8px 12px 16px",
          display: "grid",
          gap: 10,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "center",
          }}
        >
          <Radio.Group
            size="small"
            value={localLocale}
            onChange={(event) => {
              setLocalLocale(event.target.value);
            }}
            optionType="button"
            buttonStyle="solid"
            options={[
              {
                label: "English",
                value: FORMAT_LOCALE.EN_US,
              },
              {
                label: "Deutsch",
                value: FORMAT_LOCALE.DE_DE,
              },
            ]}
          />
        </div>

        <div style={tableShellStyle}>
          <table style={tableStyle}>
            <tbody>
              <tr>
                <th colSpan={6} style={sectionHeaderCellStyle}>
                  Interactive current controls
                </th>
              </tr>
              <tr>
                <th style={tableHeaderCellStyle}>Case</th>
                <th style={tableHeaderCellStyle}>Lat in</th>
                <th style={tableHeaderCellStyle}>Lng in</th>
                <th style={tableHeaderCellStyle}>Lat out</th>
                <th style={tableHeaderCellStyle}>Lng out</th>
                <th style={tableHeaderCellStyle}>Action</th>
              </tr>
              {resolvedInteractiveSamples.map((sample, index) => {
                const output = buildFormatterOutput(
                  sample.latitudeDeg,
                  sample.longitudeDeg,
                  interactiveOptions
                );

                return (
                  <tr
                    key={sample.id}
                    style={{
                      background:
                        index % 2 === 0
                          ? "rgba(255,255,255,0.72)"
                          : "rgba(248,250,252,0.82)",
                    }}
                  >
                    <td style={tableCellStyle}>{sample.label}</td>
                    <td
                      style={{
                        ...tableCellStyle,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {formatInputNumber(sample.latitudeDeg)}
                    </td>
                    <td
                      style={{
                        ...tableCellStyle,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {formatInputNumber(sample.longitudeDeg)}
                    </td>
                    <td
                      style={{
                        ...tableCellStyle,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {output.latitude}
                    </td>
                    <td
                      style={{
                        ...tableCellStyle,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {output.longitude}
                    </td>
                    <td style={tableCellStyle}>
                      {index === 0 ? (
                        <Button
                          size="small"
                          onClick={
                            isRandomizing
                              ? stopRandomUpdates
                              : startRandomUpdates
                          }
                        >
                          {isRandomizing ? "Stop" : "Random every 2s"}
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}

              <tr>
                <th colSpan={6} style={sectionHeaderCellStyle}>
                  Option matrix at representative coordinates
                </th>
              </tr>
              <tr>
                <th style={tableHeaderCellStyle}>Direction style</th>
                <th style={tableHeaderCellStyle}>Lat out</th>
                <th style={tableHeaderCellStyle}>Lng out</th>
                <th style={tableHeaderCellStyle}>Base input</th>
              </tr>
              {ALL_DIRECTION_STYLES.map((currentDirectionStyle, rowIndex) => (
                <tr
                  key={currentDirectionStyle}
                  style={{
                    background:
                      rowIndex % 2 === 0
                        ? "rgba(255,255,255,0.72)"
                        : "rgba(248,250,252,0.82)",
                  }}
                >
                  <td style={tableCellStyle}>{currentDirectionStyle}</td>
                  {(() => {
                    const output = buildFormatterOutput(
                      MATRIX_BASE_COORDINATES.latitudeDeg,
                      MATRIX_BASE_COORDINATES.longitudeDeg,
                      {
                        locale: localLocale,
                        directionStyle: currentDirectionStyle,
                        unitSymbol,
                        fractionDigits,
                      }
                    );

                    return (
                      <>
                        <td style={tableCellStyle}>{output.latitude}</td>
                        <td style={tableCellStyle}>{output.longitude}</td>
                      </>
                    );
                  })()}
                  <td
                    style={{
                      ...tableCellStyle,
                      fontVariantNumeric: "tabular-nums",
                      whiteSpace: "nowrap",
                      color: "#475569",
                    }}
                  >
                    {formatInputNumber(MATRIX_BASE_COORDINATES.latitudeDeg)}
                    {", "}
                    {formatInputNumber(MATRIX_BASE_COORDINATES.longitudeDeg)}
                  </td>
                </tr>
              ))}

              <tr>
                <th colSpan={6} style={sectionHeaderCellStyle}>
                  Edge values with current controls
                </th>
              </tr>
              <tr>
                <th style={tableHeaderCellStyle}>Case</th>
                <th style={tableHeaderCellStyle}>Lat in</th>
                <th style={tableHeaderCellStyle}>Lng in</th>
                <th style={tableHeaderCellStyle}>Lat out</th>
                <th style={tableHeaderCellStyle}>Lng out</th>
                <th style={tableHeaderCellStyle}>Mode</th>
              </tr>
              {EDGE_CASES.map((entry, index) => {
                const output = buildFormatterOutput(
                  entry.latitudeDeg,
                  entry.longitudeDeg,
                  interactiveOptions
                );

                return (
                  <tr
                    key={entry.label}
                    style={{
                      background:
                        index % 2 === 0
                          ? "rgba(255,255,255,0.72)"
                          : "rgba(248,250,252,0.82)",
                    }}
                  >
                    <td style={tableCellStyle}>{entry.label}</td>
                    <td
                      style={{
                        ...tableCellStyle,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {formatInputNumber(entry.latitudeDeg)}
                    </td>
                    <td
                      style={{
                        ...tableCellStyle,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {formatInputNumber(entry.longitudeDeg)}
                    </td>
                    <td
                      style={{
                        ...tableCellStyle,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {output.latitude}
                    </td>
                    <td
                      style={{
                        ...tableCellStyle,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {output.longitude}
                    </td>
                    <td style={{ ...tableCellStyle, color: "#475569" }}>
                      current controls
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const meta: Meta<GeographicCardinalFormatterStoryProps> = {
  title: "Common/Formatter",
  component: FormatterPreview,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    latitudeDeg: 51.25609,
    longitudeDeg: 7.1761,
    fractionDigits: 6,
    locale: FORMAT_LOCALE.EN_US,
    directionStyle: GEOGRAPHIC_DIRECTION_STYLE.CARDINAL,
  },
  argTypes: {
    locale: {
      control: false,
      table: {
        disable: true,
      },
    },
    directionStyle: {
      control: "radio",
      options: [
        GEOGRAPHIC_DIRECTION_STYLE.CARDINAL,
        GEOGRAPHIC_DIRECTION_STYLE.SIGNED,
      ],
    },
    unitSymbol: {
      control: false,
      table: {
        disable: true,
      },
    },
  },
};

export default meta;

type Story = StoryObj<GeographicCardinalFormatterStoryProps>;

export const Geo: Story = {};
