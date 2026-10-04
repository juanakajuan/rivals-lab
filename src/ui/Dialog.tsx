import {
  useEffect,
  useId,
  useRef,
  type RefObject,
  type ReactNode,
  type KeyboardEventHandler,
  type ReactEventHandler,
} from "react";
import { X } from "lucide-react";

interface DialogProps {
  readonly ref?: RefObject<HTMLDialogElement | null>;
  readonly appearance: "builder" | "map";
  readonly title: string;
  readonly description?: string;
  readonly openOnMount?: boolean;
  readonly children: ReactNode;
  readonly onRequestClose: () => void;
  readonly onKeyDown?: KeyboardEventHandler<HTMLDialogElement>;
  readonly onCancel?: ReactEventHandler<HTMLDialogElement>;
  readonly onClose?: ReactEventHandler<HTMLDialogElement>;
}

export function Dialog({
  ref,
  appearance,
  title,
  description,
  openOnMount = false,
  children,
  onRequestClose,
  onKeyDown,
  onCancel,
  onClose,
}: DialogProps): React.JSX.Element {
  const internalRef = useRef<HTMLDialogElement>(null);
  const dialogRef = ref ?? internalRef;
  const headingId = useId();
  const descriptionId = useId();
  useEffect(() => {
    if (!openOnMount) return;
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, [dialogRef, openOnMount]);
  const map = appearance === "map";
  return (
    <dialog
      ref={dialogRef}
      className={map ? "map-picker-dialog" : "builder-dialog"}
      aria-label={map ? undefined : title}
      aria-labelledby={map ? headingId : undefined}
      aria-describedby={description ? descriptionId : undefined}
      onKeyDown={onKeyDown}
      onCancel={onCancel}
      onClose={onClose}
    >
      <div className={map ? "map-picker-header" : "dialog-heading"}>
        <h2 id={map ? headingId : undefined}>{title}</h2>
        <button
          type="button"
          className={map ? "map-picker-close" : "icon-button"}
          aria-label={map ? "Close map picker" : "Close dialog"}
          onClick={onRequestClose}
        >
          {map ? <X size={18} aria-hidden="true" /> : <X size={18} />}
        </button>
      </div>
      {description ? (
        <p className="map-picker-description" id={descriptionId}>
          {description}
        </p>
      ) : null}
      {children}
    </dialog>
  );
}
