import { Descriptions } from "antd";
import { clientLabel, sinceOf } from "./lockText";
import type { DescriptionsProps } from "antd";
import type { HeldLock, Lock } from "./types";

type Items = NonNullable<DescriptionsProps["items"]>;

const lockLine = (lock: Lock) =>
  [sinceOf(lock), clientLabel(lock)].filter(Boolean).join(" · ");

const lockItems = (lock: HeldLock, showUser: boolean): Items => [
  ...(showUser
    ? [{ key: "user", label: "Gesperrt von", children: lock.userString }]
    : []),
  { key: "since", label: "Gesperrt seit", children: sinceOf(lock) ?? "–" },
  { key: "client", label: "Gesperrt in", children: clientLabel(lock) },
  ...(lock.history.length
    ? [
        {
          key: "history",
          label: "Frühere Sperren",
          children: (
            <div>
              {[...lock.history].reverse().map((old) => (
                <div key={old.id}>{lockLine(old)}</div>
              ))}
            </div>
          ),
        },
      ]
    : []),
];

export const LockDetails = ({
  lock,
  showUser = false,
  extra = [],
}: {
  lock?: HeldLock | undefined;
  showUser?: boolean;
  extra?: Items;
}) => (
  <Descriptions
    size="small"
    column={1}
    bordered
    labelStyle={{ width: 160 }}
    items={[...extra, ...(lock ? lockItems(lock, showUser) : [])]}
  />
);
