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

    if (item.veroeffentlicht) {
      result = true;
    }

    if (!item.abgeschlossen) {
      result = true;
    }

    return result;
  };
};
export default itemFilterFunction;
