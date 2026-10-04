import type { ReactNode } from "react";

interface SearchFieldProps {
  readonly wrapper: "div" | "label";
  readonly className: string;
  readonly label: string;
  readonly placeholder: string;
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly icon?: ReactNode;
  readonly autoFocus?: boolean;
  readonly clearLabel?: string;
}

export function SearchField({
  wrapper: Wrapper,
  className,
  label,
  placeholder,
  value,
  onValueChange,
  icon,
  autoFocus,
  clearLabel,
}: SearchFieldProps): React.JSX.Element {
  return (
    <Wrapper className={className}>
      {icon}
      <input
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        autoFocus={autoFocus}
        onChange={(event) => onValueChange(event.currentTarget.value)}
      />
      {clearLabel && value.length > 0 ? (
        <button
          type="button"
          onClick={() => onValueChange("")}
          aria-label={clearLabel}
        >
          Clear
        </button>
      ) : null}
    </Wrapper>
  );
}
