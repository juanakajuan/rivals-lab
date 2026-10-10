import { Dialog } from "./ui/Dialog";
import { normalizeSearch } from "./searchText";
import { SearchField } from "./ui/SearchField";
import { useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { GameModeIcon } from "./GameModeIcon";
import { GAME_MODES, type GameMode } from "./maps";

export interface MapPickerOption<Value extends string | null> {
  readonly value: Value;
  readonly name: string;
  readonly detail: string;
  readonly imagePath: string | null;
  readonly imageSize?: readonly [width: number, height: number];
}

interface MapPickerMultiple<Value extends string | null> {
  readonly selectedValues: readonly Value[];
  readonly onApply: (values: readonly NoInfer<Value>[]) => void;
}

interface MapPickerModes {
  readonly selected: GameMode | null;
  readonly onChoose: (mode: GameMode) => void;
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
  /** Lets the user pick several maps at once. Options with a null value stay single choices. */
  readonly multiple?: MapPickerMultiple<Value>;
  /** Lets the user pick a whole game mode instead of maps. */
  readonly modes?: MapPickerModes;
  readonly renderActions?: (close: () => void) => ReactNode;
  readonly onClose?: () => void;
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
  multiple,
  modes,
  renderActions,
  onClose,
}: MapPickerProps<Value>): React.JSX.Element {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const selectedCardRef = useRef<HTMLButtonElement>(null);
  const [query, setQuery] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [draft, setDraft] = useState<readonly Value[]>([]);
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
    flushSync(() => {
      setQuery("");
      setSelecting((multiple?.selectedValues.length ?? 0) > 1);
      setDraft(multiple?.selectedValues ?? []);
    });
    dialog.showModal();
    selectedCardRef.current?.focus();
  }

  function isSelected(value: Value): boolean {
    if (selecting) return draft.includes(value);
    return (
      value === selectedValue ||
      (multiple?.selectedValues.includes(value) ?? false)
    );
  }

  function toggleDraft(value: Value): void {
    setDraft((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    );
  }

  function closePicker(): void {
    const dialog = dialogRef.current;
    if (!dialog?.open) return;
    onClose?.();
    dialog.close();
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
      <Dialog
        appearance="map"
        title={title}
        {...(description === undefined ? {} : { description })}
        onRequestClose={closePicker}
        ref={dialogRef}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Escape" && !event.nativeEvent.isComposing) {
            event.preventDefault();
            closePicker();
          }
        }}
        onCancel={(event) => {
          event.preventDefault();
          closePicker();
        }}
        onClose={() => {
          if (dialogRef.current?.open) return;
          setQuery("");
          const trigger = triggerRef.current;
          if (trigger?.isConnected && trigger.getClientRects().length > 0)
            trigger.focus({ preventScroll: true });
        }}
      >
        <SearchField
          wrapper="div"
          className="map-picker-search"
          label="Search maps"
          placeholder="Search by map name or mode"
          value={query}
          onValueChange={setQuery}
        />
        {renderActions ? (
          <div className="map-picker-actions">{renderActions(closePicker)}</div>
        ) : null}
        {multiple || modes ? (
          <div className="map-picker-selection">
            {multiple ? (
              <button
                type="button"
                className="map-picker-trigger"
                aria-pressed={selecting}
                onClick={() => {
                  setSelecting(!selecting);
                  setDraft(multiple.selectedValues);
                }}
              >
                Select multiple maps
              </button>
            ) : null}
            {modes ? (
              <div
                className="map-picker-modes"
                role="group"
                aria-label="Game mode"
              >
                {GAME_MODES.map((mode) => (
                  <button
                    type="button"
                    className="map-picker-trigger"
                    key={mode}
                    aria-pressed={modes.selected === mode}
                    onClick={() => {
                      closePicker();
                      modes.onChoose(mode);
                    }}
                  >
                    <GameModeIcon mode={mode} size={16} /> {mode}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
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
              aria-pressed={isSelected(option.value)}
              onClick={() => {
                if (selecting && option.value !== null) {
                  toggleDraft(option.value);
                  return;
                }
                closePicker();
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
                {isSelected(option.value) ? (
                  <span className="map-picker-selected">Selected</span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
        {multiple && selecting ? (
          <div className="map-picker-footer">
            <button
              type="button"
              className="primary-button"
              disabled={draft.length === 0}
              onClick={() => {
                closePicker();
                multiple.onApply(draft);
              }}
            >
              Use {draft.length} {draft.length === 1 ? "map" : "maps"}
            </button>
          </div>
        ) : null}
      </Dialog>
    </>
  );
}
