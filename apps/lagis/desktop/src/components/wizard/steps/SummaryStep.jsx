import React from "react";
import { SMALL_AREA_THRESHOLD_SQM } from "../../../core/wizard/constants";

const formatArea = (area) =>
  Number(area).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const Row = ({ label, area }) => (
  <div className="flex justify-between gap-8 font-medium">
    <span>{label}</span>
    <span className="tabular-nums">{formatArea(area)}</span>
  </div>
);

const Separator = () => <hr className="my-1 border-gray-300" />;

/** Port of SummaryPanel; shows the area check done on the previous step. */
const SummaryStep = ({ value }) => {
  const check = value.areaCheck;
  if (!check?.targets) {
    return null;
  }

  return (
    <div className="flex max-w-lg flex-col gap-2">
      <div className="mb-2 text-lg font-semibold">
        Flächen der angegebenen Flurstücke
      </div>
      {check.targets.map((row) => (
        <Row
          key={row.label}
          label={`Flurstück ${row.label}:`}
          area={row.area}
        />
      ))}
      <Separator />
      {check.results.map((row) => (
        <Row
          key={row.label}
          label={`Flurstück ${row.label}:`}
          area={row.area}
        />
      ))}
      <Separator />
      <Row
        label="Differenz Quell- und Ziel-Flurstück(e):"
        area={check.difference}
      />
      {check.hasSmallArea && (
        <>
          <Separator />
          <div className="font-medium">
            Achtung! Es entstehen Flurstücke &lt; {SMALL_AREA_THRESHOLD_SQM} m².
            <br />
            Bitte die Eintragung der Belastungen und Pachtverträge
            kontrollieren.
          </div>
        </>
      )}
    </div>
  );
};

export default SummaryStep;
