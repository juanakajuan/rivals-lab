import { useId, useRef } from "react";
import { MAPS, type MapId } from "./maps";

interface MapPickerProps {
  readonly selectedMapId: MapId;
  readonly onMapChange: (mapId: MapId) => void;
}

export function MapPicker({
  selectedMapId,
  onMapChange,
}: MapPickerProps): React.JSX.Element {
  const headingId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const selectedCardRef = useRef<HTMLButtonElement>(null);

  function openPicker(): void {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    selectedCardRef.current?.focus();
  }

  return (
    <>
      <button
        type="button"
        className="map-picker-trigger"
        aria-haspopup="dialog"
        ref={triggerRef}
        onClick={openPicker}
      >
        Choose map
      </button>
      <dialog
        className="map-picker-dialog"
        aria-labelledby={headingId}
        ref={dialogRef}
        onKeyDown={(event) => event.stopPropagation()}
        onClose={() => {
          if (!dialogRef.current?.open)
            triggerRef.current?.focus({ preventScroll: true });
        }}
      >
        <div className="map-picker-header">
          <h2 id={headingId}>Choose map</h2>
          <button
            type="button"
            className="map-picker-close"
            onClick={() => dialogRef.current?.close()}
          >
            Close map picker
          </button>
        </div>
        <div className="map-picker-cards">
          {MAPS.map((map) => (
            <button
              type="button"
              className="map-picker-card"
              key={map.id}
              ref={map.id === selectedMapId ? selectedCardRef : null}
              aria-label={map.name}
              aria-pressed={map.id === selectedMapId}
              onClick={() => {
                dialogRef.current?.close();
                onMapChange(map.id);
              }}
            >
              <img
                src={map.imagePath}
                alt=""
                width={map.width}
                height={map.height}
                loading="lazy"
                decoding="async"
              />
              <span className="map-picker-card-details">
                <span className="map-picker-card-name">{map.name}</span>
                <span className="map-picker-card-mode">{map.mode}</span>
                {map.id === selectedMapId ? (
                  <span className="map-picker-selected">Selected</span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      </dialog>
    </>
  );
}
