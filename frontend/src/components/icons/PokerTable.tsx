import * as React from "react";

export interface LucideProps extends React.SVGProps<SVGSVGElement> {
  size?: string | number;
  absoluteStrokeWidth?: boolean;
}

const PokerTable = React.forwardRef<SVGSVGElement, LucideProps>(
  (
    {
      color = "currentColor",
      size = 24,
      strokeWidth = 2,
      absoluteStrokeWidth = false,
      className,
      ...rest
    },
    ref
  ) => {
    const computedStrokeWidth =
      absoluteStrokeWidth
        ? (Number(strokeWidth) * 24) / Number(size)
        : strokeWidth;

    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={computedStrokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={["lucide", "lucide-poker-table", className]
          .filter(Boolean)
          .join(" ")}
        {...rest}
      >
        <path d="M 18 11 L 18 16" />
        <path d="M 19 4 L 22 7" />
        <path d="M 2 7 L 2 21" />
        <path d="M 2 7 L 5 4" />
        <path d="M 2.5 7 L 21.5 7" />
        <path d="M 22 7 L 22 21" />
        <path d="M 5 4 L 19 4" />
        <path d="M 6 11 L 6 16" />
      </svg>
    );
  }
);

PokerTable.displayName = "PokerTable";

export default PokerTable;
