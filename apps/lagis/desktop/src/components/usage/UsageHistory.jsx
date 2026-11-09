import React from "react";
import { Select } from "antd";
import dayjs from "dayjs";

const UsageHistory = ({ days, moment, onChange }) => {
  if (!days.length) {
    return null;
  }
  const dayIndex = moment
    ? days.findIndex(({ times }) => times.includes(moment))
    : days.length;
  const times = days[dayIndex]?.times ?? [];
  const points = [
    ...days.map(({ day, times }) => ({
      label: dayjs(day).format("DD.MM.YYYY"),
      value: times.at(-1),
    })),
    { label: "Aktuell", value: undefined },
  ];

  return (
    <div className="flex-none flex items-center gap-4 border-t border-gray-200 px-3 py-2">
      <span className="text-sm text-gray-500 whitespace-nowrap">
        NKF Historie
      </span>
      <div className="flex-1 min-w-0 overflow-x-auto">
        <ol className="flex m-0 p-0 list-none">
          {points.map((point, index) => {
            const selected = index === dayIndex;
            return (
              <li key={point.label} className="relative shrink-0 w-24">
                {index < points.length - 1 && (
                  <span className="absolute top-[9px] left-1/2 w-full h-px bg-gray-300" />
                )}
                <button
                  type="button"
                  onClick={() => onChange(point.value)}
                  className="group relative flex w-full flex-col items-center gap-1 bg-transparent border-0 p-0 cursor-pointer"
                >
                  <span
                    className={
                      selected
                        ? "mt-[4px] h-[11px] w-[11px] rounded-full bg-[#1677ff] ring-4 ring-[#1677ff]/20"
                        : "mt-[4px] h-[11px] w-[11px] rounded-full bg-white border-2 border-solid border-gray-300 group-hover:border-[#1677ff]"
                    }
                  />
                  <span
                    className={
                      selected
                        ? "text-xs font-medium text-[#1677ff]"
                        : "text-xs text-gray-500 group-hover:text-[#1677ff]"
                    }
                  >
                    {point.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
      {times.length > 1 && (
        <Select
          size="small"
          value={moment}
          onChange={onChange}
          options={times.map((time) => ({
            value: time,
            label: dayjs(time).format("HH:mm:ss"),
          }))}
        />
      )}
    </div>
  );
};

export default UsageHistory;
