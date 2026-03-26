import { Timeline, Button } from "antd";
import { CloseOutlined } from "@ant-design/icons";
import type { DraftAction } from "../../../store/slices/arbeitsauftraegeDrafts";

interface PlannedTimelineProps {
  actions: DraftAction[];
  onRemove?: (index: number) => void;
  readOnly?: boolean;
}

const PlannedTimeline = ({
  actions,
  onRemove,
  readOnly,
}: PlannedTimelineProps) => {
  if (actions.length === 0) return null;

  const items = actions.map((action, idx) => ({
    dot: (
      <span
        style={{
          display: "inline-block",
          width: 10,
          height: 10,
          borderRadius: "50%",
          background: "#f5f5f5",
          border: "1px solid #d9d9d9",
        }}
      />
    ),
    children: (
      <div key={idx}>
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium text-sm">{action.actionLabel}</span>
          {!readOnly && onRemove && (
            <Button
              type="text"
              size="small"
              icon={<CloseOutlined />}
              onClick={() => onRemove(idx)}
              className="text-gray-400 hover:text-red-500"
            />
          )}
        </div>
        {action.aenderungen.map((a, aIdx) => (
          <div key={aIdx} className="text-sm ml-1">
            {a.field}:{" "}
            {a.alt ? (
              <>
                von <span className="text-gray-400">{a.alt}</span>{" "}
              </>
            ) : null}
            zu{" "}
            <b>{a.neu || "-"}</b>
          </div>
        ))}
      </div>
    ),
  }));

  return (
    <div>
      <div className="text-sm font-medium text-gray-700 mb-2">
        Geplante Aktionen ({actions.length})
      </div>
      <Timeline style={{ paddingInlineStart: 0 }} items={items} />
    </div>
  );
};

export default PlannedTimeline;
