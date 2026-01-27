import {
  useCurrentFrame,
  useVideoConfig,
  interpolate,
} from "remotion";

type AgentCardProps = {
  type: "trader" | "research";
  did: string;
  balance: string;
  status: "idle" | "analyzing" | "available" | "working";
};

export const AgentCard: React.FC<AgentCardProps> = ({
  type,
  did,
  balance,
  status,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const isTrader = type === "trader";
  const statusColor =
    status === "analyzing" || status === "working"
      ? "cyan-9"
      : status === "available"
        ? "profit"
        : "gray-9";

  // Status dot pulse
  const pulseOpacity = interpolate(
    Math.sin(frame * 0.15),
    [-1, 1],
    [0.5, 1]
  );

  return (
    <div className="h-full rounded-xl border border-gray-4 bg-gray-2/50 p-5 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div
          className={`w-10 h-10 rounded-lg flex items-center justify-center ${
            isTrader ? "bg-cyan-9/20" : "bg-profit/20"
          }`}
        >
          {isTrader ? (
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#00D4FF"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v4m0 12v4M2 12h4m12 0h4" />
              <path d="m4.93 4.93 2.83 2.83m8.48 8.48 2.83 2.83m-2.83-14.14 2.83 2.83m-14.14 8.48 2.83 2.83" />
            </svg>
          ) : (
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#82D173"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
              <path d="M11 8v6M8 11h6" />
            </svg>
          )}
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-white uppercase">
            {isTrader ? "Trader Agent" : "Research Agent"}
          </h3>
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full bg-${statusColor}`}
              style={{ opacity: pulseOpacity }}
            />
            <span className={`text-xs text-${statusColor} uppercase`}>
              {status}
            </span>
          </div>
        </div>
      </div>

      {/* DID */}
      <div className="mb-3">
        <p className="text-xs text-gray-9 mb-1">DID</p>
        <p className="font-mono text-sm text-gray-11 truncate">{did}</p>
      </div>

      {/* Balance */}
      <div className="mb-3">
        <p className="text-xs text-gray-9 mb-1">Balance</p>
        <p className="font-mono text-lg text-white">{balance}</p>
      </div>

      {/* Stats */}
      {isTrader ? (
        <div className="mt-auto pt-3 border-t border-gray-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-9">Today's P&L</span>
            <span className="font-mono text-profit">+$12.45</span>
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-gray-9">Trades</span>
            <span className="font-mono text-white">23</span>
          </div>
        </div>
      ) : (
        <div className="mt-auto pt-3 border-t border-gray-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-9">Jobs Done</span>
            <span className="font-mono text-white">47</span>
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-gray-9">Earnings</span>
            <span className="font-mono text-profit">$15.00</span>
          </div>
        </div>
      )}
    </div>
  );
};
