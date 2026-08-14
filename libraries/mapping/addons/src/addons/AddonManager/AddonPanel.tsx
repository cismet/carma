import { useMemo, useState } from "react";

import { Button, Input, Popover, Switch, Tooltip } from "antd";
import { faGear } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
  applyAddonOverrides,
  isHostMountedKind,
  isSwitchableKind,
  UNSUSPENDABLE_KIND,
  type AddonOverridesState,
} from "../../lib/addon-overrides";
import { useAddonState, useRouteAddons } from "../../lib/AddonStateContext";
import {
  addonRegistry,
  normalizeAddonEntries,
  type AddonKind,
} from "../../lib/registry";

type AddonRow = {
  kind: AddonKind;
  declared: boolean;
  config?: unknown;
  mounted: boolean;
  lockedReason?: string;
};

const PER_LAYER_HINT =
  "wird pro Layer über den Layer-Button aktiviert, nicht für die ganze Route";
const NEEDS_CONFIG_HINT =
  "braucht eine Konfiguration und kann nur von der Route deklariert werden";
const MANAGER_HINT = "der Manager selbst, sonst gibt es keinen Weg zurück";

const useAddonRows = (overrides?: AddonOverridesState): AddonRow[] => {
  const addons = useRouteAddons();

  return useMemo(() => {
    const declared = new Map<AddonKind, unknown>();
    for (const { kind, config } of normalizeAddonEntries(addons)) {
      // a kind declared twice shows the first config; the switch covers both
      if (!declared.has(kind)) {
        declared.set(kind, config);
      }
    }
    const mounted = new Set(
      applyAddonOverrides(normalizeAddonEntries(addons), overrides).map(
        ({ kind }) => kind
      )
    );

    return (Object.keys(addonRegistry) as AddonKind[])
      .sort((a, b) => a.localeCompare(b))
      .map((kind) => {
        const isDeclared = declared.has(kind);
        const lockedReason = !isHostMountedKind(kind)
          ? PER_LAYER_HINT
          : kind === UNSUSPENDABLE_KIND
          ? MANAGER_HINT
          : !isDeclared && !isSwitchableKind(kind)
          ? NEEDS_CONFIG_HINT
          : undefined;

        return {
          kind,
          declared: isDeclared,
          config: declared.get(kind),
          mounted: mounted.has(kind),
          lockedReason,
        };
      });
  }, [addons, overrides]);
};

const StatusDot = ({ on }: { on: boolean }) => (
  <span
    className={`w-2 h-2 rounded-full shrink-0 ${
      on ? "bg-blue-500" : "bg-gray-300"
    }`}
  />
);

const ConfigPopover = ({ config }: { config: unknown }) => (
  <Popover
    trigger="click"
    placement="left"
    title="Konfiguration"
    content={
      <pre className="text-xs bg-gray-100 rounded p-2 m-0 max-w-[420px] max-h-[320px] overflow-auto">
        {JSON.stringify(config, null, 2)}
      </pre>
    }
  >
    <button
      type="button"
      className="text-gray-400 hover:text-gray-600 bg-transparent border-0 cursor-pointer p-0"
      aria-label="Konfiguration anzeigen"
    >
      <FontAwesomeIcon icon={faGear} />
    </button>
  </Popover>
);

const AddonRowView = ({
  row,
  onToggle,
}: {
  row: AddonRow;
  onToggle: (kind: AddonKind, on: boolean) => void;
}) => {
  const { kind, declared, config, mounted, lockedReason } = row;

  const rowSwitch = (
    <Switch
      size="small"
      checked={mounted}
      disabled={!!lockedReason}
      onChange={(on) => onToggle(kind, on)}
      data-test-id={`addon-manager-switch-${kind}`}
    />
  );

  return (
    <li className="flex items-center gap-3 py-1.5">
      <StatusDot on={mounted} />
      <span className="font-mono text-sm grow truncate">{kind}</span>
      {declared && (
        <span className="text-xs text-gray-500 shrink-0">Route</span>
      )}
      {!isHostMountedKind(kind) && (
        <span className="text-xs text-gray-500 shrink-0">pro Layer</span>
      )}
      <span className="w-4 shrink-0 text-center">
        {config !== undefined && <ConfigPopover config={config} />}
      </span>
      {lockedReason ? (
        <Tooltip title={lockedReason} placement="left">
          {/* a disabled switch swallows its own events, so the tooltip needs a host */}
          <span className="shrink-0">{rowSwitch}</span>
        </Tooltip>
      ) : (
        rowSwitch
      )}
    </li>
  );
};

export const AddonPanel = () => {
  const [overrides, setOverrides] = useAddonState("addonOverrides");
  const rows = useAddonRows(overrides);
  const [search, setSearch] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);

  const mountedCount = rows.filter(({ mounted }) => mounted).length;
  const term = search.trim().toLowerCase();
  const visible = rows.filter(
    (row) =>
      (!activeOnly || row.mounted) &&
      (!term || row.kind.toLowerCase().includes(term))
  );

  /**
   * Both lists are written on every toggle: switching a declared addon off
   * suspends it, switching it on again only has to drop that suspension, and
   * the same in reverse for an undeclared kind. Keeping both in one update
   * avoids a row that is suspended and enabled at once.
   */
  const toggle = (kind: AddonKind, on: boolean) =>
    setOverrides((previous) => {
      const suspended = new Set(previous?.suspended ?? []);
      const enabled = new Set(previous?.enabled ?? []);
      if (on) {
        suspended.delete(kind);
        enabled.add(kind);
      } else {
        enabled.delete(kind);
        suspended.add(kind);
      }
      return { suspended: [...suspended], enabled: [...enabled] };
    });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="text-gray-500 font-mono text-sm">
          {mountedCount} von {rows.length} aktiv
        </span>
        <Button
          size="small"
          type={activeOnly ? "primary" : "default"}
          onClick={() => setActiveOnly((previous) => !previous)}
        >
          Nur aktive
        </Button>
      </div>
      <Input
        allowClear
        placeholder="Addons durchsuchen..."
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {visible.length ? (
        <ul className="flex flex-col list-none p-0 m-0 divide-y divide-gray-100">
          {visible.map((row) => (
            <AddonRowView key={row.kind} row={row} onToggle={toggle} />
          ))}
        </ul>
      ) : (
        <p className="text-gray-500 m-0">Kein Addon passt zu diesem Filter.</p>
      )}
    </div>
  );
};
