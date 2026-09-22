import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { Store } from "redux";

import { carma } from "@carma-api";
import type { LayerStackEntry } from "@carma-mapping/layers";

import { useAddonState } from "./AddonStateContext";
import type { AddonKind } from "./registry";
import { resolveWorkflowGroups, type ResolvedWorkflowGroup } from "./workflow-groups";
import type { WorkflowActivityState } from "./workflow";

type LayerStackState = { mapping?: { layers?: LayerStackEntry[] } };

/**
 * Which workflow groups run and which are paused.
 *
 * A group runs while it is visible. For an exclusive kind only one group
 * runs at a time: the topmost visible one, which is the one drawn last, so
 * the bar and the map agree on who is in charge. The rest are paused and
 * say so on their button.
 */
const deriveActivity = (
  groups: ResolvedWorkflowGroup[]
): WorkflowActivityState => {
  const claimed = new Set<AddonKind>();
  const activity: WorkflowActivityState = {};
  for (let index = groups.length - 1; index >= 0; index--) {
    const { group, kind, spec } = groups[index];
    let running = group.visible !== false;
    if (running && spec.exclusive) {
      if (claimed.has(kind)) {
        running = false;
      } else {
        claimed.add(kind);
      }
    }
    activity[group.id] = { kind, status: running ? "running" : "paused" };
  }
  return activity;
};

const activityKey = (activity: WorkflowActivityState): string =>
  JSON.stringify(activity);

const WorkflowGroupEngine = ({
  entry,
  active,
}: {
  entry: ResolvedWorkflowGroup;
  active: boolean;
}) => {
  const { group, kind, spec, definition } = entry;
  const onDefinitionChange = useCallback(
    (next: unknown) => {
      carma.mapping2D.updateStackEntry(group.id, {
        tools: [{ addon: kind, config: next }],
      });
    },
    [group.id, kind]
  );
  const Engine = spec.Engine;
  return (
    <Engine
      group={group}
      definition={definition}
      active={active}
      onDefinitionChange={onDefinitionChange}
    />
  );
};

/**
 * Mounts one engine binding per workflow group in the host's layer stack,
 * on every route, so a group that arrives from the persisted stack or from
 * a shared link finds its engine wherever it lands. Publishes what runs and
 * what is paused on the `workflowActivity` channel for the layer buttons.
 */
export const WorkflowGroupHost = ({ store }: { store: Store }) => {
  const stack = useSyncExternalStore(
    store.subscribe,
    () => (store.getState() as LayerStackState).mapping?.layers
  );
  const groups = useMemo(() => resolveWorkflowGroups(stack ?? []), [stack]);
  const activity = useMemo(() => deriveActivity(groups), [groups]);

  const [, setActivity] = useAddonState("workflowActivity");
  const publishedRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const key = activityKey(activity);
    if (publishedRef.current === key) {
      return;
    }
    publishedRef.current = key;
    setActivity(activity);
  }, [activity, setActivity]);

  return (
    <>
      {groups.map((entry) => (
        <WorkflowGroupEngine
          key={entry.group.id}
          entry={entry}
          active={activity[entry.group.id]?.status === "running"}
        />
      ))}
    </>
  );
};
