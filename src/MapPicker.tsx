import { useId, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";

export interface MapPickerOption<Value extends string | null> {
  readonly value: Value;
  readonly name: string;
  readonly detail: string;
  readonly imagePath: string | null;
  readonly imageSize?: readonly [width: number, height: number];
}

interface MapPickerProps<Value extends string | null> {
  readonly options: readonly MapPickerOption<Value>[];
  readonly selectedValue: NoInfer<Value> | undefined;
  readonly triggerLabel: string;
  readonly triggerContent?: ReactNode;
  readonly triggerClassName?: string;
  readonly disabled?: boolean;
  readonly title: string;
  readonly description?: string;
  readonly onChoose: (value: NoInfer<Value>) => void;
}

function normalizeSearch(text: string): string {
  return text.trim().toLowerCase().replace(/['’]/g, "");
}

export function MapPicker<Value extends string | null>({
  options,
  selectedValue,
  triggerLabel,
  triggerContent,
  triggerClassName = "map-picker-trigger",
  disabled = false,
  title,
  description,
  onChoose,
}: MapPickerProps<Value>): React.JSX.Element {
  const headingId = useId();
  const descriptionId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const selectedCardRef = useRef<HTMLButtonElement>(null);
  const [query, setQuery] = useState("");
  const searchTerm = normalizeSearch(query);
  const visibleOptions = options.filter((option) =>
    normalizeSearch(`${option.name} ${option.detail}`).includes(searchTerm),
  );
  const initialValue = options.some((option) => option.value === selectedValue)
    ? selectedValue
    : options[0]?.value;

  function openPicker(): void {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    flushSync(() => setQuery(""));
    dialog.showModal();
    selectedCardRef.current?.focus();
  }

  return (
    <>
      <button
        type="button"
        className={triggerClassName}
        aria-label={triggerLabel}
        aria-haspopup="dialog"
        disabled={disabled}
        ref={triggerRef}
        onClick={openPicker}
      >
        {triggerContent ?? triggerLabel}
      </button>
      <dialog
        className="map-picker-dialog"
        aria-labelledby={headingId}
        aria-describedby={description ? descriptionId : undefined}
        ref={dialogRef}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Escape" && !event.nativeEvent.isComposing) {
            event.preventDefault();
            event.currentTarget.close();
          }
        }}
        onClose={() => {
          if (dialogRef.current?.open) return;
          setQuery("");
          const trigger = triggerRef.current;
          if (trigger?.isConnected && trigger.getClientRects().length > 0)
            trigger.focus({ preventScroll: true });
        }}
      >
        <div className="map-picker-header">
          <h2 id={headingId}>{title}</h2>
          <button
            type="button"
            className="map-picker-close"
            onClick={() => dialogRef.current?.close()}
          >
            Close map picker
          </button>
        </div>
        {description ? (
          <p className="map-picker-description" id={descriptionId}>
            {description}
          </p>
        ) : null}
        <div className="map-picker-search">
          <input
            type="search"
            aria-label="Search maps"
            placeholder="Search by map name or mode"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </div>
        <div className="map-picker-cards">
          {visibleOptions.length === 0 ? (
            <p className="map-picker-empty" role="status">
              No maps match your search.
            </p>
          ) : null}
          {visibleOptions.map((option) => (
            <button
              type="button"
              className="map-picker-card"
              key={option.value === null ? "any-map" : `map:${option.value}`}
              ref={option.value === initialValue ? selectedCardRef : null}
              aria-label={option.name}
              aria-pressed={option.value === selectedValue}
              onClick={() => {
                dialogRef.current?.close();
                onChoose(option.value);
              }}
            >
              {option.imagePath ? (
                <img
                  src={option.imagePath}
                  alt=""
                  width={option.imageSize?.[0]}
                  height={option.imageSize?.[1]}
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <span className="map-picker-neutral" aria-hidden="true">
                  {option.name}
                </span>
              )}
              <span className="map-picker-card-details">
                <span className="map-picker-card-name">{option.name}</span>
                <span className="map-picker-card-mode">{option.detail}</span>
                {option.value === selectedValue ? (
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
