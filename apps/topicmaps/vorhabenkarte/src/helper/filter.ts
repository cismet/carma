export interface Project {
  id: number;
  titel: string;
  abgeschlossen: boolean;
  abgeschlossen_am?: string;
  veroeffentlicht: boolean;
}

const filterProjectsToShow = (projects: Project[]): Project[] => {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  return projects.filter((p) => {
    if (!p.veroeffentlicht) return false;

    if (!p.abgeschlossen) return true;

    if (!p.abgeschlossen_am) return false;
    const doneDate = new Date(p.abgeschlossen_am);
    return doneDate >= sixMonthsAgo;
  });
};

const itemFilterFunction = ({ filterState }) => {
  return (item) => {
    let result = false;
    const all = ["Ladestation", "Verleihstation"];

    if (filterState.stationsart) {
      result = (filterState.stationsart || all).includes(item.typ);
    }

    if (result && item.typ === "Ladestation") {
      if (filterState.nur_online) {
        result = item.online;
      } else {
        result = true;
      }
      if (result) {
        if (filterState.immer_offen) {
          result = !item.halb_oeffentlich;
        } else {
          result = true;
        }
      }
      if (result && filterState.gruener_strom) {
        result = item.gruener_strom === true;
      }

      if (result && filterState.ladebox_zu) {
        result = item.ladebox_zu;
      }
    }

    return result;
  };
};
export default itemFilterFunction;
