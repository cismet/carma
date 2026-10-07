import { useState } from "react";
import { useSelector } from "react-redux";
import useDraftTable, { activeRowId } from "../editing/useDraftTable";
import useEditSection from "../editing/useEditSection";
import useStammdatenList from "../editing/useStammdatenList";
import useAreaDrawing from "../editing/useAreaDrawing";
import { getGeometry } from "../../store/slices/lagis";
import { newDienststelleRow } from "../../core/wizard/adminData";
import { planarArea } from "../../core/wizard/geometry";

// Agencies table and the drawing map share one selection and one
// useAreaDrawing, so both live on the Offices page.
const useAgencyAreas = () => {
  const parcelGeometry = useSelector(getGeometry);
  const parcelArea = parcelGeometry
    ? Math.round(planarArea(parcelGeometry) * 100) / 100
    : undefined;
  const { editable, draft, patch } = useEditSection("admin");
  const selection = useState();
  const rows = draft?.dienststellen ?? [];
  const dienststellen = useStammdatenList("dienststellen", editable);

  const drawing = useAreaDrawing({
    rows,
    onChange: (next) => patch({ dienststellen: next }),
    activeId: activeRowId(rows, selection[0]),
    parcelArea,
    dienststellen,
  });

  const draftTable = useDraftTable({
    section: "admin",
    field: "dienststellen",
    newRow: (parcel) => newDienststelleRow({ ...parcel, area: parcelArea }),
    selection,
    onRowsChange: drawing.onRowsChange,
  });

  return {
    editable,
    rows,
    draftTable,
    dienststellen,
    parcelGeometry,
    parcelArea,
    mapProps: drawing.mapProps,
  };
};

export default useAgencyAreas;
