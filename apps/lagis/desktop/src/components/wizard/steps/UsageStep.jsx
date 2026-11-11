import { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Alert, Spin } from "antd";
import SheetTable from "../../editing/SheetTable";
import { nutzungColumns } from "../../usage/nutzungColumns";
import ParcelSections from "../ParcelSections";
import SplitUsageStats from "../SplitUsageStats";
import {
  adminTargets,
  hasNonStaedtischTargets,
} from "../../../core/wizard/adminData";
import { explain } from "../../../core/wizard/errors";
import { WIZARD_ACTIONS } from "../../../core/wizard/constants";
import { TEST_NUTZUNG_STAMMDATEN } from "../../../core/wizard/testFixture";
import {
  inheritUsage,
  loadSourceUsage,
  newUsageRow,
  sourceUsageFor,
} from "../../../core/wizard/usageData";
import { ensureStammdatenList } from "../../../store/slices/stammdaten";

const LOADING = "Nutzungen werden geladen...";

const STATS_TITLES = {
  [WIZARD_ACTIONS.SPLIT]: "Nutzungen vor und nach der Teilung",
  [WIZARD_ACTIONS.JOIN]: "Nutzungen vor und nach der Zusammenlegung",
  [WIZARD_ACTIONS.SPLIT_JOIN]:
    "Nutzungen vor und nach der Zusammenlegung/Teilung",
};
const TABLE_COLUMNS = {
  anlageklasse: "27%",
  bezeichnung: "27%",
  fläche: "14%",
  preis: "14%",
  gesamtpreis: "18%",
};

const UsageStep = ({ value, onChange, onProblem, testMode = false }) => {
  const dispatch = useDispatch();
  const jwt = useSelector((state) => state.auth.jwt);
  const [stammdaten, setStammdaten] = useState();
  const [loadError, setLoadError] = useState();
  const [activeIds, setActiveIds] = useState({});

  const targets = useMemo(() => adminTargets(value), [value]);
  const usage = value.usage ?? {};

  useEffect(() => {
    let cancelled = false;
    onProblem(LOADING);
    Promise.all([
      testMode
        ? TEST_NUTZUNG_STAMMDATEN
        : dispatch(ensureStammdatenList("nutzung")),
      testMode ||
      (value.sourceUsage && value.sourceUsageFor === sourceUsageFor(value))
        ? value.sourceUsage
        : loadSourceUsage(value, jwt),
    ])
      .then(([loaded, sourceUsage]) => {
        if (!cancelled) {
          onChange({
            sourceUsage,
            sourceUsageFor: sourceUsageFor(value),
            usage: { ...value.usage, ...inheritUsage(value, sourceUsage) },
          });
          setStammdaten(loaded);
          onProblem(null);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          const message = explain(
            "Die Nutzungsarten konnten nicht geladen werden",
            e
          );
          setLoadError(message);
          onProblem(message);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tableColumns = useMemo(
    () =>
      stammdaten
        ? nutzungColumns({ stammdaten, originalById: new Map() })
            .filter((column) => column.key in TABLE_COLUMNS)
            .map((column) => ({ ...column, width: TABLE_COLUMNS[column.key] }))
        : undefined,
    [stammdaten]
  );

  if (loadError) {
    return null;
  }
  if (!stammdaten) {
    return (
      <div className="flex justify-center p-8">
        <Spin />
      </div>
    );
  }
  if (!targets.length) {
    return (
      <Alert
        type="info"
        showIcon
        message="Nutzung"
        description={
          hasNonStaedtischTargets(value)
            ? "Nutzungen können nur für städtische Flurstücke gepflegt werden"
            : "Für diese Aktion gibt es kein Flurstück, dem Nutzungen zugeordnet werden können"
        }
      />
    );
  }

  return (
    <>
      {STATS_TITLES[value.action] && (
        <SplitUsageStats
          title={STATS_TITLES[value.action]}
          sourceUsage={value.sourceUsage}
          usage={usage}
          anlageklassen={stammdaten.anlageklassen}
        />
      )}
      <ParcelSections targets={targets}>
        {(label, actionsSlot) => {
          const rows = usage[label] ?? [];
          return (
            <SheetTable
              columns={tableColumns}
              editable
              edit={{
                actionsSlot,
                rows,
                newRow: (selected) =>
                  newUsageRow(selected ?? rows[rows.length - 1]),
                activeId: activeIds[label],
                onActiveChange: (id) =>
                  setActiveIds((previous) => ({ ...previous, [label]: id })),
                onChange: (next) =>
                  onChange({ usage: { ...usage, [label]: next } }),
              }}
            />
          );
        }}
      </ParcelSections>
    </>
  );
};

export default UsageStep;
