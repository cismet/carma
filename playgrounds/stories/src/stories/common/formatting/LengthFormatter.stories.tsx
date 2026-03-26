import { useEffect, useMemo, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { Radio } from "antd";
import { ResponsiveStatusBar } from "@carma-commons/ui/components";
import { FORMAT_LOCALE, formatLengthMeters } from "@carma/units/helpers";

type LengthFormatterStoryProps = {
  meters: number;
  locale: string;
  kilometerThresholdMeters: number;
  maximumFractionDigitsMeters: number;
  maximumFractionDigitsKilometers: number;
};

type RepresentativeCase = {
  label: string;
  meters: number;
};

const TABLE_FONT_FAMILY =
  'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

const REPRESENTATIVE_CASES: readonly RepresentativeCase[] = [
  { label: "zero", meters: 0 },
  { label: "small meters", meters: 0.42 },
  { label: "whole meters", meters: 12 },
  { label: "near threshold", meters: 999.9 },
  { label: "at threshold", meters: 1000 },
  { label: "kilometers", meters: 1532.4 },
  { label: "negative kilometers", meters: -2200.8 },
] as const;

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
  Number.isFinite(value) ? String(value) : "NaN";

const FormatterPreview = ({
  meters,
  locale,
  kilometerThresholdMeters,
  maximumFractionDigitsMeters,
  maximumFractionDigitsKilometers,
}: LengthFormatterStoryProps) => {
  const [localLocale, setLocalLocale] = useState(locale);

  useEffect(() => {
    setLocalLocale(locale);
  }, [locale]);

  const formatCurrent = useMemo(
    () =>
      formatLengthMeters(meters, {
        locale: localLocale,
        kilometerThresholdMeters,
        maximumFractionDigitsMeters,
        maximumFractionDigitsKilometers,
      }),
    [
      kilometerThresholdMeters,
      localLocale,
      maximumFractionDigitsKilometers,
      maximumFractionDigitsMeters,
      meters,
    ]
  );

  const statusValues = useMemo(
    () => [
      `locale ${localLocale}`,
      `threshold ${kilometerThresholdMeters}m`,
      `meters digits ${maximumFractionDigitsMeters}`,
      `km digits ${maximumFractionDigitsKilometers}`,
      `input ${formatInputNumber(meters)}`,
      `output ${formatCurrent}`,
    ],
    [
      formatCurrent,
      kilometerThresholdMeters,
      localLocale,
      maximumFractionDigitsKilometers,
      maximumFractionDigitsMeters,
      meters,
    ]
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
        <ResponsiveStatusBar label="length formatter" values={statusValues} />
      </div>

      <div
        style={{
          maxWidth: 1280,
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
                <th colSpan={3} style={sectionHeaderCellStyle}>
                  Interactive current controls
                </th>
              </tr>
              <tr>
                <th style={tableHeaderCellStyle}>Case</th>
                <th style={tableHeaderCellStyle}>Meters in</th>
                <th style={tableHeaderCellStyle}>Value out</th>
              </tr>
              <tr style={{ background: "rgba(255,255,255,0.72)" }}>
                <td style={tableCellStyle}>interactive current</td>
                <td
                  style={{
                    ...tableCellStyle,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {formatInputNumber(meters)}
                </td>
                <td
                  style={{
                    ...tableCellStyle,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {formatCurrent}
                </td>
              </tr>

              <tr>
                <th colSpan={3} style={sectionHeaderCellStyle}>
                  Representative cases with current controls
                </th>
              </tr>
              <tr>
                <th style={tableHeaderCellStyle}>Case</th>
                <th style={tableHeaderCellStyle}>Meters in</th>
                <th style={tableHeaderCellStyle}>Value out</th>
              </tr>
              {REPRESENTATIVE_CASES.map((entry, index) => (
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
                    {formatInputNumber(entry.meters)}
                  </td>
                  <td
                    style={{
                      ...tableCellStyle,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {formatLengthMeters(entry.meters, {
                      locale: localLocale,
                      kilometerThresholdMeters,
                      maximumFractionDigitsMeters,
                      maximumFractionDigitsKilometers,
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const meta: Meta<LengthFormatterStoryProps> = {
  title: "Common/Formatter",
  component: FormatterPreview,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    meters: 1532.4,
    locale: FORMAT_LOCALE.EN_US,
    kilometerThresholdMeters: 1000,
    maximumFractionDigitsMeters: 2,
    maximumFractionDigitsKilometers: 2,
  },
  argTypes: {
    locale: {
      control: false,
      table: {
        disable: true,
      },
    },
  },
};

export default meta;

type Story = StoryObj<LengthFormatterStoryProps>;

export const Length: Story = {};
