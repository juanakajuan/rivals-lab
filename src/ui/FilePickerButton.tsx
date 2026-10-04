import { useRef, type ReactNode } from "react";

interface FilePickerParts {
  readonly button: ReactNode;
  readonly input: ReactNode;
}

interface FilePickerButtonProps {
  readonly accept: string;
  readonly inputLabel: string;
  readonly inputAppearance: "hidden" | "sr-only";
  readonly buttonClassName: string;
  readonly disabled?: boolean;
  readonly onFile: (file: File) => void;
  readonly children: ReactNode;
  readonly render?: (parts: FilePickerParts) => ReactNode;
}

export function FilePickerButton({
  accept,
  inputLabel,
  inputAppearance,
  buttonClassName,
  disabled,
  onFile,
  children,
  render,
}: FilePickerButtonProps): ReactNode {
  const inputRef = useRef<HTMLInputElement>(null);
  const button = (
    <button
      type="button"
      className={buttonClassName}
      disabled={disabled}
      onClick={() => inputRef.current?.click()}
    >
      {children}
    </button>
  );
  const input = (
    <input
      ref={inputRef}
      type="file"
      hidden={inputAppearance === "hidden" ? true : undefined}
      className={inputAppearance === "sr-only" ? "sr-only" : undefined}
      tabIndex={inputAppearance === "sr-only" ? -1 : undefined}
      accept={accept}
      aria-label={inputLabel}
      onChange={(event) => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = "";
        if (file) onFile(file);
      }}
    />
  );
  return render ? (
    render({ button, input })
  ) : (
    <>
      {button}
      {input}
    </>
  );
}
