import type { RootState } from "./index";

export const getSelectedTeamName = (state: RootState): string | null => {
  const teamId = state.arbeitsauftraege.selectedTeamId;
  if (teamId == null) return null;
  const teams = (state.keyTables.data.teams || []) as {
    id: number;
    name?: string;
  }[];
  return teams.find((t) => t.id === teamId)?.name ?? null;
};
