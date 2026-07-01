import { useState } from "react";
import ConjunctionToggle from "./ConjunctionToggle";
import type { Conjunction } from "./ConjunctionToggle";

// Separator with a centered UND/ODER toggle, shown between two groups.
const GroupConjunction = () => {
  const [conjunction, setConjunction] = useState<Conjunction>("UND");

  return (
    <div className="flex items-center gap-3 py-1">
      <div className="flex-1 h-px bg-gray-200" />
      <ConjunctionToggle value={conjunction} onChange={setConjunction} />
      <div className="flex-1 h-px bg-gray-200" />
    </div>
  );
};

export default GroupConjunction;
