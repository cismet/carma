import { useMemo } from "react";
import { Select } from "antd";
import { useSelector } from "react-redux";
import { getKeyTablesData } from "../../store/slices/keyTables";

interface Team {
  id: number;
  name?: string;
}

interface TeamSelectProps {
  value: number | null;
  onChange: (value: number | null) => void;
}

const TeamSelect = ({ value, onChange }: TeamSelectProps) => {
  const keyTablesData = useSelector(getKeyTablesData);

  const teamOptions = useMemo(
    () =>
      [...((keyTablesData.teams || []) as Team[])]
        .sort((a, b) =>
          (a.name || "").localeCompare(b.name || "", "de", {
            sensitivity: "base",
          })
        )
        .map((team) => ({ value: team.id, label: team.name || "" })),
    [keyTablesData.teams]
  );

  return (
    <Select
      value={value}
      onChange={onChange}
      options={teamOptions}
      placeholder="Team auswählen"
      allowClear
      showSearch
      filterOption={(input, option) =>
        (option?.label ?? "").toLowerCase().includes(input.toLowerCase())
      }
      style={{ width: 300 }}
    />
  );
};

export default TeamSelect;
