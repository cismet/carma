import useEditSection from "../editing/useEditSection";
import { activeRowId } from "../editing/useDraftTable";

// the Vertrag selected in the Vorgänge table, for the detail blocks
const useActiveVertrag = (selectedId) => {
  const { editable, draft, patch } = useEditSection("vertrag");
  const rows = draft?.vertraege ?? [];
  const id = activeRowId(rows, selectedId);
  const vertrag = rows.find((row) => row.id === id);
  const update = (changes) =>
    patch({
      vertraege: rows.map((row) =>
        row.id === id ? { ...row, ...changes } : row
      ),
    });
  return { editable, draft, vertrag, update };
};

export default useActiveVertrag;
