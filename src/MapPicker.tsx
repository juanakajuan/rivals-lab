import { X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Badge } from "./components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "./components/ui/dialog";
import { visibleFocusTarget } from "./overlayFocus";

export interface MapPickerOption<Value extends string | null> {
  readonly value: Value;
  readonly name: string;
  readonly detail: string;
  readonly imagePath: string | null;
  readonly imageSize?: readonly [width: number, height: number];
}

interface MapPickerProps<Value extends string | null> {
  readonly active: boolean;
  readonly options: readonly MapPickerOption<Value>[];
  readonly selectedValue: NoInfer<Value> | undefined;
  readonly triggerLabel: string;
  readonly triggerContent?: ReactNode;
  readonly triggerClassName?: string;
  readonly disabled?: boolean;
  readonly title: string;
  readonly description?: string;
  readonly onChoose: (
    value: NoInfer<Value>,
    opener: HTMLButtonElement | null,
  ) => void;
  readonly renderActions?: (close: () => void) => ReactNode;
  readonly onClose?: () => void;
}

function normalizeSearch(text: string): string {
  return text.trim().toLowerCase().replace(/['’]/g, "");
}

export function MapPicker<Value extends string | null>({
  active,
  options,
  selectedValue,
  triggerLabel,
  triggerContent,
  triggerClassName = "map-picker-trigger",
  disabled = false,
  title,
  description,
  onChoose,
  renderActions,
  onClose,
}: MapPickerProps<Value>): React.JSX.Element {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const openRef = useRef(false);
  const [open, setOpen] = useState(false);
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
    if (openRef.current || !active) return;
    setQuery("");
    openRef.current = true;
    setOpen(true);
  }

  const closePicker = useCallback((): void => {
    if (!openRef.current) return;
    openRef.current = false;
    setOpen(false);
    onClose?.();
  }, [onClose]);

  useEffect(() => {
    if (!active) closePicker();
  }, [active, closePicker]);

  return (
    <Dialog
      open={open && active}
      disablePointerDismissal
      onOpenChange={(nextOpen, details) => {
        if (details.reason === "escape-key" && details.event.isComposing) {
          details.cancel();
          return;
        }
        if (nextOpen) openPicker();
        else closePicker();
      }}
      onOpenChangeComplete={(nextOpen) => {
        if (nextOpen)
          selectedCardRef.current?.scrollIntoView({ block: "nearest" });
        else setQuery("");
      }}
    >
      <DialogTrigger
        render={<Button variant="outline" />}
        type="button"
        className={`h-auto min-h-11 shrink-0 px-3 py-2 text-xs ${triggerClassName}`}
        aria-label={triggerLabel}
        aria-haspopup="dialog"
        disabled={disabled}
        ref={triggerRef}
        onClick={openPicker}
      >
        {triggerContent ?? triggerLabel}
      </DialogTrigger>
      <DialogContent
        className="map-picker-dialog flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-[960px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[960px]"
        showCloseButton={false}
        initialFocus={() => selectedCardRef.current ?? true}
        finalFocus={
          active ? true : () => visibleFocusTarget(triggerRef.current)
        }
        onKeyDown={(event) => event.stopPropagation()}
      >
        <div className="map-picker-header">
          <DialogTitle className="text-lg">{title}</DialogTitle>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="map-picker-close size-11 shrink-0"
            aria-label="Close map picker"
            onClick={closePicker}
          >
            <X size={18} aria-hidden="true" />
          </Button>
        </div>
        {description ? (
          <DialogDescription className="map-picker-description">
            {description}
          </DialogDescription>
        ) : null}
        <div className="map-picker-search">
          <Input
            className="h-11 w-full text-sm"
            type="search"
            aria-label="Search maps"
            placeholder="Search by map name or mode"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </div>
        {renderActions ? (
          <div className="map-picker-actions">{renderActions(closePicker)}</div>
        ) : null}
        <div className="map-picker-cards">
          {visibleOptions.length === 0 ? (
            <p className="map-picker-empty" role="status">
              No maps match your search.
            </p>
          ) : null}
          {visibleOptions.map((option) => (
            <Button
              type="button"
              variant="outline"
              className="map-picker-card flex h-auto min-h-11 min-w-0 flex-col items-stretch justify-start gap-0 overflow-hidden whitespace-normal rounded-lg border-2 bg-background p-0 text-left aria-pressed:border-primary"
              key={option.value === null ? "any-map" : `map:${option.value}`}
              ref={option.value === initialValue ? selectedCardRef : null}
              aria-label={option.name}
              aria-pressed={option.value === selectedValue}
              onClick={() => {
                if (!openRef.current || !active) return;
                closePicker();
                onChoose(option.value, triggerRef.current);
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
                  <Badge
                    variant="outline"
                    className="map-picker-selected border-primary"
                  >
                    Selected
                  </Badge>
                ) : null}
              </span>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
