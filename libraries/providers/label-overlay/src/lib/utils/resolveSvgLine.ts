import type { SvgLine } from "@carma-commons/svg";
import type { CssPixels } from "@carma/units/types";
export type SvgLineScratch = {
  start: SvgLine["start"];
  end: SvgLine["end"];
  line: SvgLine;
};

export const createSvgLineScratch = (): SvgLineScratch => {
  const zero = 0 as CssPixels;
  const start = { x: zero, y: zero };
  const end = { x: zero, y: zero };
  return {
    start,
    end,
    line: { start, end },
  };
};

export const resolveSvgLine = ({
  getSvgLine,
  scratch,
}: {
  getSvgLine?: (() => SvgLine | null) | null;
  scratch?: SvgLineScratch;
}): SvgLine | null => {
  if (!getSvgLine) {
    return null;
  }

  const line = getSvgLine();
  if (!line) {
    return null;
  }
  if (!scratch) {
    return line;
  }

  scratch.start.x = line.start.x;
  scratch.start.y = line.start.y;
  scratch.end.x = line.end.x;
  scratch.end.y = line.end.y;
  return scratch.line;
};
