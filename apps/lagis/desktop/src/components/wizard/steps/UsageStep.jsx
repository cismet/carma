import { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Alert, Spin } from "antd";
import {
  EuroOutlined,
  FlagOutlined,
  NumberOutlined,
  OrderedListOutlined,
  RiseOutlined,
  TagOutlined,
} from "@ant-design/icons";
import SheetTable from "../../editing/SheetTable";
import { nutzungColumns } from "../../usage/nutzungColumns";
import ParcelSelector, { activeTarget } from "../ParcelSelector";
import {
  adminTargets,
  hasNonStaedtischTargets,
} from "../../../core/wizard/adminData";
import { explain } from "../../../core/wizard/errors";
import { formatKey } from "../../../core/wizard/keys";
import {
  gesamtpreis,
  loadInheritedUsage,
  newUsageRow,
} from "../../../core/wizard/usageData";
import { formatPrice } from "../../../core/tools/helper";
import {
  buchungsNummer,
  isBuchwert,
  stilleReserve,
} from "../../../core/editing/usage";
import { ensureStammdatenList } from "../../../store/slices/stammdaten";

const LOADING = "Nutzungen werden geladen...";
const INPUT_COLUMNS = ["anlageklasse", "bezeichnung", "fläche", "preis"];

// the columns of the Nutzung table that the wizard table hides;
// a wizard row is always a new Nutzung, so there is no original row
const UsageSummary = ({ row, nutzungsart }) => {
  const items = [
    [NumberOutlined, "Nutzung Nr", row ? "neu" : "–"],
    [
      OrderedListOutlined,
      "Buchungs-Nr",
      row ? buchungsNummer(undefined, row) : "–",
    ],
    [TagOutlined, "Nutzungsart", nutzungsart ? nutzungsart.schluessel : "–"],
    [
      EuroOutlined,
      "Gesamtpreis",
      row && gesamtpreis(row) !== null ? formatPrice(gesamtpreis(row)) : "–",
    ],
    [
      RiseOutlined,
      "Stille Reserve",
      row ? formatPrice(stilleReserve(undefined, row)) : "–",
    ],
    [
      FlagOutlined,
      "Buchwert",
      row ? (isBuchwert(undefined, row) ? "ja" : "nein") : "–",
    ],
  ];
  return (
    <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm w-fit">
      {items.map(([Icon, title, shown]) => (
        <span key={title} className="flex items-center gap-2">
          <Icon />
          {title}: {shown}
        </span>
      ))}
    </div>
  );
};

const UsageStep = ({ value, onChange, onProblem }) => {
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
      dispatch(ensureStammdatenList("nutzung")),
      loadInheritedUsage(value, jwt),
    ])
      .then(([loaded, inherited]) => {
        if (!cancelled) {
          if (Object.keys(inherited).length) {
            onChange({ usage: { ...value.usage, ...inherited } });
          }
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

  const nutzungsartById = useMemo(
    () =>
      new Map((stammdaten?.nutzungsarten ?? []).map((art) => [art.id, art])),
    [stammdaten]
  );

  const tableColumns = useMemo(
    () =>
      stammdaten
        ? nutzungColumns({ stammdaten, originalById: new Map() }).filter(
            (column) => INPUT_COLUMNS.includes(column.key)
          )
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

  const label = formatKey(activeTarget(targets, value.activeParcel).key);
  const rows = usage[label] ?? [];
  const activeRow = rows.find((row) => row.id === activeIds[label]);

  return (
    <div className="flex flex-1 flex-col gap-4">
      <ParcelSelector
        targets={targets}
        value={label}
        onChange={(next) => onChange({ activeParcel: next })}
      />
      <div key={label} className="flex flex-col gap-3">
        <UsageSummary
          row={activeRow}
          nutzungsart={nutzungsartById.get(activeRow?.nutzungsartId)}
        />
        <SheetTable
          columns={tableColumns}
          editable
          scroll={{ x: "max-content" }}
          edit={{
            rows,
            newRow: (selected) =>
              newUsageRow(selected ?? rows[rows.length - 1]),
            activeId: activeIds[label],
            onActiveChange: (id) =>
              setActiveIds((previous) => ({ ...previous, [label]: id })),
            onChange: (rows) =>
              onChange({ usage: { ...usage, [label]: rows } }),
          }}
        />
      </div>
    </div>
  );
};

export default UsageStep;
