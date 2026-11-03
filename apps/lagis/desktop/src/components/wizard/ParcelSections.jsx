import { formatKey } from "../../core/wizard/keys";

// the header sticks to the scroll edge above WizardModal's 20px padding
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
      {targets.map(({ key }) => {
        const label = formatKey(key);
        return (
          <section
            key={label}
            className="rounded-md border border-solid border-gray-200"
          >
            <header className="sticky -top-5 z-20 flex items-center gap-2 rounded-t-md border-0 border-b border-solid border-gray-200 bg-gray-50 px-3 py-2 font-medium">
              <span className="h-2 w-2 rounded-full bg-blue-500" />
              Flurstück {label}
            </header>
            <div className="flex flex-col gap-2 p-3">{children(label)}</div>
          </section>
        );
      })}
    </div>
  );
};

export default ParcelSections;
