import { Typography } from "antd";
import { DetailsBox, LockDetails } from "./LockDetails";
import { lockLine } from "./lockText";
import type { HeldLock } from "./types";

export interface LockConflict {
  key: string;
  objectLabel: string;
  lock: HeldLock;
  own: boolean;
  // e.g. "Flurstück Barmen-1-364/0" when locked from another object
  lockedVia?: string | undefined;
}

export const SingleConflict = ({ conflict }: { conflict: LockConflict }) => (
  <LockDetails
    objectLabel={conflict.objectLabel}
    lock={conflict.lock}
    showUser={!conflict.own}
    extra={
      conflict.lockedVia
        ? [{ key: "via", label: "Gesperrt über", value: conflict.lockedVia }]
        : []
    }
  />
);

export const ConflictList = ({ conflicts }: { conflicts: LockConflict[] }) => (
  <DetailsBox>
    {conflicts.map((conflict) => (
      <div key={conflict.key}>
        <Typography.Text strong>{conflict.objectLabel}</Typography.Text>
        <div>
          {[
            conflict.own ? "von Ihnen" : conflict.lock.userString,
            lockLine(conflict.lock),
            conflict.lockedVia && `über ${conflict.lockedVia}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </div>
      </div>
    ))}
  </DetailsBox>
);
