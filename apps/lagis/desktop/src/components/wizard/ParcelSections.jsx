import { useState } from "react";
import { formatKey } from "../../core/wizard/keys";

const ParcelCard = ({ label, children }) => {
  const [actionsSlot, setActionsSlot] = useState(null);
  return (
    <section className="rounded-md border border-solid border-gray-200">
      <header className="sticky -top-5 z-20 flex items-center gap-2 rounded-t-md border-0 border-b border-solid border-gray-200 bg-gray-50 px-3 py-3.5 font-medium">
        <span className="h-2 w-2 rounded-full bg-blue-500" />
        Flurstück {label}
        <div ref={setActionsSlot} className="ml-auto flex" />
      </header>
      <div className="flex flex-col gap-2 p-3">
        {children(label, actionsSlot)}
      </div>
    </section>
  );
};

const ParcelSections = ({ targets, children }) => {
  if (targets.length === 1) {
    return (
      <div className="flex flex-1 flex-col gap-2">
        {children(formatKey(targets[0].key))}
      </div>
    );
  }
  return (
    <div className="flex flex-1 flex-col gap-5">
      {targets.map(({ key }) => (
        <ParcelCard key={formatKey(key)} label={formatKey(key)}>
          {children}
        </ParcelCard>
      ))}
    </div>
  );
};

export default ParcelSections;
