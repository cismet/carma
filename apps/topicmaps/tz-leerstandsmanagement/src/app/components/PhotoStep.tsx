import { useRef } from "react";
import type { ChangeEvent } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faImages } from "@fortawesome/free-regular-svg-icons";
import { faCamera, faXmark } from "@fortawesome/free-solid-svg-icons";

export interface CapturedPhoto {
  id: string;
  file: File;
  /** object URL for the thumbnail, revoked by the form */
  url: string;
}

export interface PhotoGroup<K extends string = string> {
  name: K;
  /** short name in the summary */
  short: string;
  label: string;
  artKey: number;
  min: number;
  max: number;
}

interface PhotoStepProps<K extends string> {
  groups: PhotoGroup<K>[];
  photos: Record<K, CapturedPhoto[]>;
  onAdd: (group: K, files: File[]) => void;
  onRemove: (group: K, id: string) => void;
}

/**
 * Step 1 of the capture wizard: one card per photo group. The camera tile
 * hands over to the camera app of the phone, the second tile to the photo
 * library.
 */
export const PhotoStep = <K extends string>({
  groups,
  photos,
  onAdd,
  onRemove,
}: PhotoStepProps<K>) => {
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  // both inputs are shared, the group is remembered while the picker is open
  const target = useRef<K>();

  const open = (group: K, input: HTMLInputElement | null) => {
    target.current = group;
    input?.click();
  };

  const onFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (target.current !== undefined && files.length > 0) {
      onAdd(target.current, files);
    }
  };

  return (
    <div>
      {groups.map((group) => {
        const current = photos[group.name];
        const count = current.length;
        const state =
          count >= group.min && count > 0
            ? "ls-done"
            : group.min === 0
            ? "ls-optional"
            : "";
        return (
          <section key={group.name} className="ls-photo-group">
            <div className="ls-photo-group-hd">
              <div>
                <div className="ls-photo-group-title">{group.label}</div>
                <div className="ls-photo-group-hint">
                  {group.min > 0
                    ? `mindestens ${group.min}, bis zu ${group.max}`
                    : `freiwillig, bis zu ${group.max}`}
                </div>
              </div>
              <span className={`ls-photo-count ${state}`}>
                {count}/{group.max}
              </span>
            </div>
            <div className="ls-thumbs">
              {current.map((photo) => (
                <div key={photo.id} className="ls-thumb">
                  <img src={photo.url} alt={group.label} />
                  <button
                    type="button"
                    onClick={() => onRemove(group.name, photo.id)}
                    aria-label="Foto entfernen"
                  >
                    <FontAwesomeIcon icon={faXmark} />
                  </button>
                </div>
              ))}
              {count < group.max && (
                <>
                  <button
                    type="button"
                    className="ls-photo-tile ls-photo-tile-pri"
                    onClick={() => open(group.name, cameraRef.current)}
                    aria-label={`Foto aufnehmen: ${group.label}`}
                  >
                    <FontAwesomeIcon icon={faCamera} />
                    <span>Foto</span>
                  </button>
                  <button
                    type="button"
                    className="ls-photo-tile"
                    onClick={() => open(group.name, libraryRef.current)}
                    aria-label={`Aus der Mediathek wählen: ${group.label}`}
                  >
                    <FontAwesomeIcon icon={faImages} />
                    <span>Mediathek</span>
                  </button>
                </>
              )}
            </div>
          </section>
        );
      })}

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={onFiles}
      />
      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={onFiles}
      />
    </div>
  );
};
