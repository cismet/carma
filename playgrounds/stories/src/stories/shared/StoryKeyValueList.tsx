import type { ReactNode } from "react";

export type StoryKeyValueItem = {
  id: string;
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  fractionDigits?: number;
};

type StoryKeyValueListProps = {
  items: StoryKeyValueItem[];
};

const normalizeValue = (value: ReactNode) => {
  if (typeof value === "number" && !Number.isFinite(value)) {
    return "-";
  }
  return value;
};

const splitDecimal = (figure: string) => {
  const [rawIntPart, fractionPart] = figure.split(".");
  const intPart =
    rawIntPart === "" ? "0" : rawIntPart === "-" ? "-0" : rawIntPart;
  return {
    intPart,
    fractionPart: fractionPart ?? "",
  };
};

export const StoryKeyValueList = ({ items }: StoryKeyValueListProps) => {
  if (items.length === 0) return null;

  const parsedRows = items.map((item) => {
    const normalizedValue = normalizeValue(item.value);
    const isNumeric = typeof normalizedValue === "number";
    const safeFractionDigits = Math.max(0, Math.floor(item.fractionDigits ?? 0));
    const numericText = isNumeric ? normalizedValue.toFixed(safeFractionDigits) : null;
    const decimal = numericText ? splitDecimal(numericText) : null;
    return { item, normalizedValue, decimal, safeFractionDigits };
  });

  const maxFractionDigits = Math.max(
    0,
    ...parsedRows.map(({ safeFractionDigits }) => safeFractionDigits)
  );
  const hiddenFractionPlaceholder =
    maxFractionDigits > 0 ? `.${"0".repeat(maxFractionDigits)}` : "";

  return (
    <div
      style={{
        marginTop: 6,
        marginBottom: 0,
        width: "fit-content",
        display: "grid",
        gridTemplateColumns: "max-content max-content max-content",
        columnGap: 0,
        rowGap: 4,
        alignItems: "baseline",
        fontSize: 12,
        lineHeight: 1.2,
      }}
    >
      {parsedRows.map(({ item, normalizedValue, decimal, safeFractionDigits }) => (
        <span
          key={item.id}
          style={{
            display: "contents",
          }}
        >
          <span
            style={{
              color: "rgba(226,232,240,0.78)",
              minWidth: "6ch",
              whiteSpace: "nowrap",
              paddingRight: 10,
            }}
          >
            {item.label}
          </span>

          {decimal ? (
            <>
              <span
                style={{
                  color: "#e2e8f0",
                  whiteSpace: "nowrap",
                  textAlign: "right",
                  fontVariantNumeric: "tabular-nums",
                  fontFeatureSettings: '"tnum" 1, "lnum" 1',
                }}
              >
                {decimal.intPart}
              </span>
              <span
                style={{
                  color: "#e2e8f0",
                  textAlign: "left",
                  whiteSpace: "nowrap",
                  fontVariantNumeric: "tabular-nums",
                  fontFeatureSettings: '"tnum" 1, "lnum" 1',
                }}
              >
                {safeFractionDigits > 0 ? (
                  `.${decimal.fractionPart}`
                ) : hiddenFractionPlaceholder ? (
                  <span style={{ visibility: "hidden" }}>
                    {hiddenFractionPlaceholder}
                  </span>
                ) : (
                  ""
                )}
                {item.unit ?? ""}
              </span>
            </>
          ) : (
            <span
              style={{
                color: "#e2e8f0",
                whiteSpace: "nowrap",
                textAlign: "right",
                gridColumn: "2 / span 2",
                justifySelf: "end",
                fontVariantNumeric: "tabular-nums",
                fontFeatureSettings: '"tnum" 1, "lnum" 1',
              }}
            >
              {normalizedValue}
              {item.unit ?? ""}
            </span>
          )}
        </span>
      ))}
    </div>
  );
};
