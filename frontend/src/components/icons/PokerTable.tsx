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
        viewBox="0 0 26 26"
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
        {/* tabletop */}
        <path d="M3.5 8h19" />

        {/* rim */}
        <path d="M3 8l3-3h14l3 3" />

        {/* outer legs */}
        {/*<path d="M3 10v12" />
        <path d="M23 10v12" />
        */}
        <path d="M3 8v12" />
        <path d="M23 8v12" />

        {/* inner supports */}
        <path d="M7 12v5" />
        <path d="M19 12v5" />
      </svg>
    );
  }
);

PokerTable.displayName = "PokerTable";

export default PokerTable;
