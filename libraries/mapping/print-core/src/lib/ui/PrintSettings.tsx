import { faPrint } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Button, Radio, Select } from "antd";
import type { RadioChangeEvent } from "antd";

import { scaleOptions as defaultScaleOptions } from "../core";
import type { Orientation, ScaleOption } from "../core";

const DEFAULT_DPI_OPTIONS = ["72", "100", "200", "300"];

export interface PrintSettingsProps {
  /** Currently selected page orientation. */
  orientation: Orientation;
  /** Currently selected scale denominator as string (e.g. "250"). */
  scale: string;
  /** Currently selected resolution as string (e.g. "72"). */
  dpi: string;

  /**
   * Change handlers. The component is Redux-free and fully controlled — the
   * consuming app maps these callbacks onto its store dispatches.
   */
  onOrientationChange: (orientation: Orientation) => void;
  onScaleChange: (scale: string) => void;
  onDpiChange: (dpi: string) => void;
  /** Triggered by the "Vorschau" button (start/redraw the print preview). */
  onPreview: () => void;

  /** Optional overrides. */
  scaleOptions?: ScaleOption[];
  dpiOptions?: string[];
  title?: string;
  previewLabel?: string;
  className?: string;
}

/**
 * Presentational print settings panel (Format / Maßstab / Auflösung + Vorschau).
 * Holds no engine and no Redux dependency — values come in as props, changes go
 * out as callbacks.
 */
export const PrintSettings = ({
  orientation,
  scale,
  dpi,
  onOrientationChange,
  onScaleChange,
  onDpiChange,
  onPreview,
  scaleOptions = defaultScaleOptions,
  dpiOptions = DEFAULT_DPI_OPTIONS,
  title = "Drucken",
  previewLabel = "Vorschau",
  className = "p-2 flex flex-col gap-3",
}: PrintSettingsProps) => {
  const handleOrientation = (e: RadioChangeEvent) => {
    onOrientationChange(e.target.value as Orientation);
  };

  const handleDpi = (e: RadioChangeEvent) => {
    onDpiChange(e.target.value as string);
  };

  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <FontAwesomeIcon icon={faPrint} className="text-xl" />
        <h4 className="mb-0">{title}</h4>
      </div>

      <h5 className="mb-0">Format DIN A4</h5>
      <Radio.Group onChange={handleOrientation} value={orientation}>
        <div className="flex items-center gap-1">
          <Radio value="portrait">hoch</Radio>
          <Radio value="landscape">quer</Radio>
        </div>
      </Radio.Group>

      <hr className="my-0" />
      <h5 className="mb-0">Maßstab</h5>
      <Select
        showSearch
        placeholder="Wählen einen Maßstab"
        optionFilterProp="label"
        onChange={onScaleChange}
        options={scaleOptions}
        value={scale}
      />

      <hr className="my-0" />
      <h5 className="mb-0">Auflösung [dpi]</h5>
      <Radio.Group onChange={handleDpi} value={dpi}>
        <div className="flex items-center gap-1">
          {dpiOptions.map((value) => (
            <Radio key={value} value={value}>
              {value}
            </Radio>
          ))}
        </div>
      </Radio.Group>

      <Button onClick={onPreview}>{previewLabel}</Button>
    </div>
  );
};

export default PrintSettings;
