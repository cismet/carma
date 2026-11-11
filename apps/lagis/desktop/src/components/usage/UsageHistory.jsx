import React from "react";
import { Select } from "antd";
import dayjs from "dayjs";

const dayIndexOf = (days, moment) =>
  moment ? days.findIndex(({ times }) => times.includes(moment)) : days.length;

export const UsageHistoryTime = ({ days, moment, onChange }) => {
  const times = days[dayIndexOf(days, moment)]?.times ?? [];
  if (times.length < 2) {
    return null;
  }
  return (
    <Select
      size="small"
      value={moment}
      onChange={onChange}
      options={times.map((time) => ({
        value: time,
        label: dayjs(time).format("HH:mm:ss"),
      }))}
    />
  );
};

const UsageHistory = ({ days, moment, onChange }) => {
  if (!days.length) {
    return null;
  }
  const dayIndex = dayIndexOf(days, moment);
  const points = [
    ...days.map(({ day, times }) => ({
      label: dayjs(day).format("DD.MM.YYYY"),
      // a day with several changes opens on its earliest one
      value: times[0],
    })),
    { label: "Aktuell", value: undefined },
  ];

  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="min-w-0 max-w-[480px] overflow-x-auto overflow-y-hidden py-1">
        <ol className="flex m-0 p-0 list-none">
          {points.map((point, index) => {
            const selected = index === dayIndex;
            return (
              <li key={point.label} className="relative shrink-0 w-20">
                {index < points.length - 1 && (
                  <span className="absolute top-[6px] left-1/2 w-full h-px bg-gray-300" />
                )}
                <button
                  type="button"
                  onClick={() => onChange(point.value)}
                  className="group relative flex w-full flex-col items-center gap-0.5 bg-transparent border-0 p-0 cursor-pointer"
                >
                  <span
                    className={
                      selected
                        ? "mt-[2px] h-[9px] w-[9px] rounded-full bg-[#1677ff] ring-2 ring-[#1677ff]/20"
                        : "mt-[2px] h-[9px] w-[9px] rounded-full bg-white border-2 border-solid border-gray-300 group-hover:border-[#1677ff]"
                    }
                  />
                  <span
                    className={
                      selected
                        ? "text-[11px] leading-none font-medium text-[#1677ff]"
                        : "text-[11px] leading-none text-gray-500 group-hover:text-[#1677ff]"
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
    </div>
  );
};

export default UsageHistory;
