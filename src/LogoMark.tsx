import { useId } from "react";

const FLASK_PATH =
  "M13.5 4V12.5L6.2 25A2 2 0 0 0 8 28H24A2 2 0 0 0 25.8 25L18.5 12.5V4";

export function LogoMark(): React.JSX.Element {
  const clipId = useId();
  return (
    <svg
      className="logo-mark"
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      <clipPath id={clipId}>
        <path d={`${FLASK_PATH}Z`} />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        <rect x="0" y="18.5" width="16" height="14" fill="var(--blue)" />
        <rect x="16" y="18.5" width="16" height="14" fill="var(--red)" />
      </g>
      <circle cx="15" cy="15" r="1.3" fill="currentColor" />
      <circle cx="17.2" cy="11.2" r="0.9" fill="currentColor" />
      <path
        d={FLASK_PATH}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M11.5 4H20.5"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
