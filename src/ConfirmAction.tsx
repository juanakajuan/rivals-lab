import { useEffect, useRef, useState, type ComponentProps } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./components/ui/alert-dialog";

export interface ConfirmationCopy {
  readonly title: string;
  readonly description: string;
  readonly confirmLabel: string;
}

interface ConfirmActionProps {
  readonly open: boolean;
  readonly copy: ConfirmationCopy;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
  readonly finalFocus: NonNullable<
    ComponentProps<typeof AlertDialogContent>["finalFocus"]
  >;
}

export function ConfirmAction({
  open,
  copy,
  onCancel,
  onConfirm,
  finalFocus,
}: ConfirmActionProps): React.JSX.Element {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [closedCopy, setClosedCopy] = useState(copy);
  useEffect(() => {
    if (open) setClosedCopy(copy);
  }, [open, copy]);
  const displayCopy = open ? copy : closedCopy;
  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen, details) => {
        if (details.reason === "escape-key" && details.event.isComposing) {
          details.cancel();
          return;
        }
        if (!nextOpen) onCancel();
      }}
    >
      <AlertDialogContent
        initialFocus={cancelRef}
        finalFocus={finalFocus}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{displayCopy.title}</AlertDialogTitle>
          <AlertDialogDescription>
            {displayCopy.description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel ref={cancelRef}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            {displayCopy.confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
