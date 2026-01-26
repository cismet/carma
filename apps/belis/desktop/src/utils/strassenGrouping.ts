import type { DataNode } from "antd/es/tree";

export type GroupingMode = "byKey" | "byStreet";

export interface StrassenItem {
  id: number;
  pk: string;
  strasse: string;
}

interface ExtendedDataNode extends DataNode {
  data?: StrassenItem;
}

/**
 * Groups items by pk ranges (00000-00099, 00100-00199, etc.)
 */
function groupByKeyRange(items: StrassenItem[]): Map<string, StrassenItem[]> {
  const groups = new Map<string, StrassenItem[]>();

  items.forEach((item) => {
    // Skip items with invalid pk
    if (!item.pk) return;

    const pkNum = parseInt(item.pk, 10);

    // Skip items where pk is not a valid number
    if (isNaN(pkNum)) return;

    const rangeStart = Math.floor(pkNum / 100) * 100;
    const rangeEnd = rangeStart + 99;
    const rangeKey = `${String(rangeStart).padStart(5, "0")}-${String(
      rangeEnd
    ).padStart(5, "0")}`;

    if (!groups.has(rangeKey)) {
      groups.set(rangeKey, []);
    }
    groups.get(rangeKey)!.push(item);
  });

  // Sort groups by range key
  return new Map(
    [...groups.entries()].sort((a, b) =>
      a[0].localeCompare(b[0], "de", { numeric: true })
    )
  );
}

/**
 * Groups items alphabetically by first letter of strasse field
 */
function groupByStreetLetter(
  items: StrassenItem[]
): Map<string, StrassenItem[]> {
  const groups = new Map<string, StrassenItem[]>();

  items.forEach((item) => {
    // Skip items with invalid strasse
    if (!item.strasse) return;

    const firstLetter = item.strasse.charAt(0).toUpperCase() || "#";

    if (!groups.has(firstLetter)) {
      groups.set(firstLetter, []);
    }
    groups.get(firstLetter)!.push(item);
  });

  // Sort groups alphabetically, with umlauts at the end
  const umlauts = ["Ä", "Ö", "Ü"];
  return new Map(
    [...groups.entries()].sort((a, b) => {
      const aIsUmlaut = umlauts.includes(a[0]);
      const bIsUmlaut = umlauts.includes(b[0]);

      if (aIsUmlaut && !bIsUmlaut) return 1;
      if (!aIsUmlaut && bIsUmlaut) return -1;

      return a[0].localeCompare(b[0], "de");
    })
  );
}

/**
 * Converts grouped items to antd Tree DataNode format
 */
function groupsToTreeData(
  groups: Map<string, StrassenItem[]>,
  groupingMode: GroupingMode
): ExtendedDataNode[] {
  const treeData: ExtendedDataNode[] = [];

  groups.forEach((items, groupKey) => {
    // Sort items within each group
    const sortedItems = [...items].sort((a, b) => {
      if (groupingMode === "byKey") {
        const aPk = a.pk || "";
        const bPk = b.pk || "";
        return aPk.localeCompare(bPk, "de", { numeric: true });
      }
      const aStrasse = a.strasse || "";
      const bStrasse = b.strasse || "";
      return aStrasse.localeCompare(bStrasse, "de");
    });

    const children: ExtendedDataNode[] = sortedItems.map((item) => ({
      key: `item-${item.id}`,
      title:
        groupingMode === "byKey"
          ? `${item.pk || ""} - ${item.strasse || ""}`
          : `${item.strasse || ""} (${item.pk || ""})`,
      isLeaf: true,
      data: item,
    }));

    treeData.push({
      key: `group-${groupKey}`,
      title: groupKey,
      children,
      selectable: false,
    });
  });

  return treeData;
}

/**
 * Main function to build tree data based on grouping mode
 */
export function buildTreeData(
  items: StrassenItem[],
  groupingMode: GroupingMode
): ExtendedDataNode[] {
  const groups =
    groupingMode === "byKey"
      ? groupByKeyRange(items)
      : groupByStreetLetter(items);

  return groupsToTreeData(groups, groupingMode);
}
