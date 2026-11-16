import { Segmented } from "antd";

import {
  CARMA_PLAN_CHOICES,
  useCarmaPlanActions,
  type CarmaPlanChoice,
} from "./carma-plan-actions";

/**
 * The panel the carma plan row opens: what the site shows. "Bestand" keeps
 * the plan on but shows the mesh as it is, so the two can be flipped. A
 * scenario can be picked once it is built.
 */
export const CarmaPlanPanel = () => {
  const { scenario, setScenario, siteTitle, isLoading, ready, error } =
    useCarmaPlanActions();
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2">
      <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
        {siteTitle ? `Fläche ${siteTitle}` : "Fläche"}
      </span>
      <Segmented<CarmaPlanChoice>
        // the site shows reality until the chosen scenario is built
        value={
          scenario !== "reality" && !ready.includes(scenario)
            ? "reality"
            : scenario
        }
        onChange={setScenario}
        options={CARMA_PLAN_CHOICES.map(({ id, label }) => ({
          value: id,
          label,
          disabled: id !== "reality" && !ready.includes(id),
        }))}
      />
      {isLoading && <span className="text-xs text-gray-500">wird gebaut …</span>}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
};

export const CarmaPlanInteractionPanel = () => <CarmaPlanPanel />;
