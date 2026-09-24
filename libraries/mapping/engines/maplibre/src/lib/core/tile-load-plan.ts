/** Rank first, preserve stage order within a rank, and schedule each key once.
 * Reads must describe one stable selection; only local result collections mutate.
 */
export const planTileLoadStages = <Entry>(
  stages: readonly (readonly Entry[])[],
  read: Readonly<{
    key: (entry: Entry) => string;
    priority: (entry: Entry) => number;
    eligible: (entry: Entry, key: string) => boolean;
  }>
): Readonly<{
  stages: readonly (readonly Entry[])[];
  scheduledKeys: ReadonlySet<string>;
}> => {
  const priorities = [
    ...new Set(stages.flatMap((stage) => stage.map(read.priority))),
  ].sort((a, b) => b - a);
  const scheduledKeys = new Set<string>();
  const planned = priorities.flatMap((priority) =>
    stages.map((stage) =>
      stage.filter((entry) => {
        if (read.priority(entry) !== priority) return false;
        const key = read.key(entry);
        if (scheduledKeys.has(key) || !read.eligible(entry, key)) return false;
        scheduledKeys.add(key);
        return true;
      })
    )
  );
  return { stages: planned, scheduledKeys };
};
