import { useEffect, useMemo, useState } from "react";

import type { Meta, StoryObj } from "@storybook/react";
import { Radio } from "antd";

import { ResponsiveStatusBar } from "@carma-commons/ui/components";
import { FORMAT_LOCALE, formatAreaSquareMetersAdaptive } from "@carma-units";
type AreaFormatterStoryProps = {
  areaSquareMeters: number;
  locale: string;
  significantDigits: number;
  hectareThresholdSquareMeters: number;
};

type RepresentativeCase = {
  label: string;
  areaSquareMeters: number;
};

const TABLE_FONT_FAMILY =
  'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

const REPRESENTATIVE_CASES: readonly RepresentativeCase[] = [
  { label: "zero", areaSquareMeters: 0 },
  { label: "small area", areaSquareMeters: 12.34 },
  { label: "medium area", areaSquareMeters: 123.456 },
  { label: "near threshold", areaSquareMeters: 4999 },
  { label: "above threshold", areaSquareMeters: 5000 },
  { label: "multi hectare", areaSquareMeters: 54321 },
  { label: "negative", areaSquareMeters: -5 },
  { label: "non-finite", areaSquareMeters: Number.NaN },
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
  areaSquareMeters,
  locale,
  significantDigits,
  hectareThresholdSquareMeters,
}: AreaFormatterStoryProps) => {
  const [localLocale, setLocalLocale] = useState(locale);

  useEffect(() => {
    setLocalLocale(locale);
  }, [locale]);

  const formatCurrent = useMemo(
    () =>
      formatAreaSquareMetersAdaptive(areaSquareMeters, {
        locale: localLocale,
        significantDigits,
        hectareThresholdSquareMeters,
      }),
    [
      areaSquareMeters,
      hectareThresholdSquareMeters,
      localLocale,
      significantDigits,
    ]
  );

  const statusValues = useMemo(
    () => [
      `locale ${localLocale}`,
      `digits ${significantDigits}`,
      `threshold ${hectareThresholdSquareMeters}m²`,
      `input ${formatInputNumber(areaSquareMeters)}`,
      `output ${formatCurrent}`,
    ],
    [
      areaSquareMeters,
      formatCurrent,
      hectareThresholdSquareMeters,
      localLocale,
      significantDigits,
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
        <ResponsiveStatusBar label="area formatter" values={statusValues} />
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
                label: "Deutsch",
                value: FORMAT_LOCALE.DE_DE,
              },
              {
                label: "English",
                value: FORMAT_LOCALE.EN_US,
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
                <th style={tableHeaderCellStyle}>Area in</th>
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
                  {formatInputNumber(areaSquareMeters)}
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
                <th style={tableHeaderCellStyle}>Area in</th>
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
                    {formatInputNumber(entry.areaSquareMeters)}
                  </td>
                  <td
                    style={{
                      ...tableCellStyle,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {formatAreaSquareMetersAdaptive(entry.areaSquareMeters, {
                      locale: localLocale,
                      significantDigits,
                      hectareThresholdSquareMeters,
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

const meta: Meta<AreaFormatterStoryProps> = {
  title: "Common/Formatter",
  component: FormatterPreview,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    areaSquareMeters: 54321,
    locale: FORMAT_LOCALE.DE_DE,
    significantDigits: 3,
    hectareThresholdSquareMeters: 4999,
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

type Story = StoryObj<AreaFormatterStoryProps>;

export const Area: Story = {};
