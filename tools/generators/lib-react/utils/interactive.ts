import { createInterface, emitKeypressEvents } from "readline";
import { stdin as input, stdout as output } from "node:process";
import { getProjects, names } from "@nx/devkit";

const makeRl = () => createInterface({ input, output });

export const promptSelect = async (
  message: string,
  choices: string[]
): Promise<string> => {
  if (!process.stdout?.isTTY) {
    const rl = makeRl();
    try {
      output.write(`\n${message}\n`);
      choices.forEach((c, i) => output.write(`  ${i + 1}) ${c}\n`));
      while (true) {
        const answer: string = await new Promise((resolve) =>
          rl.question(`Select [1-${choices.length}]: `, resolve)
        );
        const idx = Number.parseInt(answer.trim(), 10);
        if (!Number.isNaN(idx) && idx >= 1 && idx <= choices.length)
          return choices[idx - 1];
        output.write("Invalid selection. Try again.\n");
      }
    } finally {
      rl.close();
    }
  }

  return await new Promise<string>((resolve) => {
    let index = 0;
    const render = () => {
      output.write("\x1B[2J\x1B[0f");
      output.write(`${message}\n`);
      for (let i = 0; i < choices.length; i += 1) {
        const prefix = i === index ? "> " : "  ";
        output.write(`${prefix}${choices[i]}\n`);
      }
      output.write("\nUse ↑/↓ and Enter. 0-9 also works.\n");
    };

    emitKeypressEvents(process.stdin);
    const wasRaw = (process.stdin as unknown as { isRaw?: boolean }).isRaw;
    process.stdin.setRawMode?.(true);
    process.stdin.resume();

    const onKeypress = (_chunk: Buffer, key: any) => {
      if (key?.name === "up") {
        index = (index - 1 + choices.length) % choices.length;
        render();
      } else if (key?.name === "down") {
        index = (index + 1) % choices.length;
        render();
      } else if (key?.name === "return" || key?.name === "enter") {
        process.stdin.off("keypress", onKeypress);
        process.stdin.setRawMode?.(!!wasRaw);
        output.write("\n");
        resolve(choices[index]);
      }
    };

    process.stdin.on("keypress", onKeypress);
    render();
  });
};

export const promptInput = async (
  message: string,
  initial?: string,
  validate?: (v: string) => boolean | string
): Promise<string> => {
  const rl = makeRl();
  try {
    while (true) {
      const prompt = initial ? `${message} (${initial}): ` : `${message}: `;
      const answer: string = await new Promise((resolve) =>
        rl.question(prompt, resolve)
      );
      const val = (answer.trim().length ? answer.trim() : initial ?? "").trim();
      const res = validate ? validate(val) : true;
      if (res === true) return val;
      output.write(`${typeof res === "string" ? res : "Invalid value"}\n`);
    }
  } finally {
    rl.close();
  }
};

export const normalizeName = (raw: string): string => {
  if (raw.includes("/")) {
    throw new Error('Name must not include path separators.');
  }
  return names(raw).fileName;
};

export const projectNameExists = (tree: any, candidate: string): boolean => {
  for (const [pName] of getProjects(tree)) {
    if (pName === candidate) return true;
  }
  return false;
};
