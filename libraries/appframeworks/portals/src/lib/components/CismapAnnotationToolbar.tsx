import {
  RuntimeAnnotationsToolbar,
  type RuntimeAnnotationsToolbarProps,
} from "@carma-mapping/annotations/runtime";

import { CISMAP_ANNOTATION_TOOLBAR_CLASS_NAMES } from "./cismap-annotation-toolbar-visual-options";

export type CismapAnnotationToolbarProps = Pick<
  RuntimeAnnotationsToolbarProps,
  "plugins"
>;

export const CismapAnnotationToolbar = ({
  plugins,
}: CismapAnnotationToolbarProps) => (
  <RuntimeAnnotationsToolbar
    plugins={plugins}
    classNames={CISMAP_ANNOTATION_TOOLBAR_CLASS_NAMES}
    disableSelectWithoutAnnotations
    tooltipPlacement="bottom"
  />
);
