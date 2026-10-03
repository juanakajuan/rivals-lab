import * as Dialog from "@radix-ui/react-dialog";
import { useState, type ReactNode, type RefObject } from "react";
import { X } from "lucide-react";

interface ModalDialogProps {
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly fallbackFocusRef: RefObject<HTMLElement | null>;
}

function isFocusTarget(element: HTMLElement | null): element is HTMLElement {
  return (
    element !== null &&
    element !== document.body &&
    element.isConnected &&
    !element.matches(":disabled") &&
    element.getClientRects().length > 0 &&
    window.getComputedStyle(element).visibility !== "hidden"
  );
}

export function ModalDialog({
  title,
  onClose,
  children,
  fallbackFocusRef,
}: ModalDialogProps): React.JSX.Element {
  const [opener] = useState(() => {
    const activeElement = document.activeElement;
    return activeElement instanceof HTMLElement ? activeElement : null;
  });

  return (
    <Dialog.Root
      open={true}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="builder-dialog-overlay">
          <Dialog.Content
            className="builder-dialog"
            aria-describedby={undefined}
            onPointerDownOutside={(event) => event.preventDefault()}
            onInteractOutside={(event) => event.preventDefault()}
            onKeyDown={(event) => event.stopPropagation()}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              const target = isFocusTarget(opener)
                ? opener
                : fallbackFocusRef.current;
              if (isFocusTarget(target)) target.focus();
            }}
          >
            <div className="dialog-heading">
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Close dialog"
                >
                  <X size={18} />
                </button>
              </Dialog.Close>
            </div>
            {children}
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
