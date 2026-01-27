import {
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";

type StatCardProps = {
  label: string;
  value: string;
  trend: number;
  icon: "escrow" | "lock" | "trade";
};

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  trend,
  icon,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const isTrendUp = trend >= 0;

  // Value count-up animation
  const countProgress = spring({
    frame,
    fps,
    config: { damping: 200 },
  });

  // Parse numeric value for animation
  const numericValue = parseFloat(value.replace(/[^0-9.]/g, ""));
  const displayValue = Math.floor(numericValue * countProgress);
  const suffix = value.replace(/[0-9.,]/g, "");

  const iconElements = {
    escrow: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M9 12h6M9 16h6M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6l4 4v12a2 2 0 0 1-2 2z" />
      </svg>
    ),
    lock: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
    trade: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M3 3v18h18" />
        <path d="m19 9-5 5-4-4-3 3" />
      </svg>
    ),
  };

  return (
    <div className="h-full rounded-xl border border-gray-4 bg-gray-2/50 p-5 flex flex-col">
      {/* Icon */}
      <div className="w-10 h-10 rounded-lg bg-egyptian-blue/20 text-egyptian-blue flex items-center justify-center mb-3">
        {iconElements[icon]}
      </div>

      {/* Label */}
      <p className="text-sm text-gray-9 mb-2">{label}</p>

      {/* Value */}
      <p className="text-3xl font-bold text-white font-mono">
        {displayValue.toLocaleString()}
        {suffix && <span className="text-lg text-gray-11 ml-1">{suffix}</span>}
      </p>

      {/* Trend */}
      <div className="mt-auto pt-3 flex items-center gap-2">
        <span
          className={`flex items-center gap-1 text-sm font-mono ${
            isTrendUp ? "text-profit" : "text-loss"
          }`}
        >
          {isTrendUp ? "↑" : "↓"}
          {Math.abs(trend)}%
        </span>
        <span className="text-xs text-gray-9">vs yesterday</span>
      </div>
    </div>
  );
};
