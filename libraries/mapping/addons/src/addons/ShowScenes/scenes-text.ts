/** "1 Szene", "3 Szenen" */
export const scenesText = (count: number): string =>
  `${count} ${count === 1 ? "Szene" : "Szenen"}`;
