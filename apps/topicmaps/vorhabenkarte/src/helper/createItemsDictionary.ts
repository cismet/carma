interface Thema {
  id: number;
  name: string;
  farbe: string;
  signatur: string;
  fuellung: number;
}

interface Item {
  thema: Thema;
}

interface Topic {
  name: string;
  farbe: string;
}

const createItemsDictionary = (items: Item[]) => {
  const seenNames = new Set();
  const topics: Topic[] = [];

  for (const item of items) {
    const { name, farbe } = item.thema;

    if (!seenNames.has(name)) {
      seenNames.add(name);
      topics.push({ name, farbe });
    }
  }

  return { topics };
};

export default createItemsDictionary;
