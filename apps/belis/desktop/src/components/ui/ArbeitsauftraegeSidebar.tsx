interface ArbeitsauftraegeSidebarProps {
  width: number;
}

interface WorkOrderItem {
  orderNumber: string;
  team: string;
  date: string;
  count: number;
}

const PLACEHOLDER_DATA: WorkOrderItem[] = [
  { orderNumber: "A00017219", team: "sag7", date: "16/12/2025", count: 1 },
  { orderNumber: "A00017220", team: "sag3", date: "17/12/2025", count: 3 },
  { orderNumber: "A00017221", team: "sag7", date: "18/12/2025", count: 2 },
  { orderNumber: "A00017222", team: "sag1", date: "19/12/2025", count: 5 },
  { orderNumber: "A00017223", team: "sag4", date: "20/12/2025", count: 1 },
];

const ArbeitsauftraegeSidebar = ({ width }: ArbeitsauftraegeSidebarProps) => {
  return (
    <div
      style={{ width, minWidth: width }}
      className="h-full border-r border-gray-200 bg-white flex flex-col overflow-hidden"
    >
      <div className="px-3 py-2 border-b border-gray-200 bg-gray-50">
        <span className="font-semibold text-sm text-gray-700">
          Arbeitsaufträge
        </span>
        <span className="ml-2 text-xs text-gray-400">
          {PLACEHOLDER_DATA.length}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {PLACEHOLDER_DATA.map((item) => (
          <div
            key={item.orderNumber}
            className="px-3 py-2 border-b border-gray-100 hover:bg-blue-50 cursor-pointer"
          >
            <div className="flex justify-between items-baseline">
              <span className="font-semibold text-sm text-gray-900">
                {item.orderNumber}
              </span>
              <span className="text-xs text-gray-500">{item.team}</span>
            </div>
            <div className="flex justify-between items-baseline mt-0.5">
              <span className="text-xs text-gray-400">{item.date}</span>
              <span className="text-xs text-gray-400">{item.count}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ArbeitsauftraegeSidebar;
