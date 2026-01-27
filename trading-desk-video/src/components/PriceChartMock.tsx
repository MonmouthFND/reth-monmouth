import {
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";

// Generate price data points
const generatePriceData = (count: number): number[] => {
  const data: number[] = [];
  let price = 3200;

  for (let i = 0; i < count; i++) {
    const randomWalk = (Math.random() - 0.48) * 15;
    const trend = i * 0.3;
    price = 3200 + trend + randomWalk + Math.sin(i / 10) * 20;
    data.push(price);
  }

  return data;
};

const priceData = generatePriceData(100);

export const PriceChartMock: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Animation progress
  const drawProgress = interpolate(frame, [0, fps * 2], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Current price (animated)
  const currentPrice = 3245.67 + Math.sin(frame * 0.05) * 10;
  const priceChange = 2.3 + Math.sin(frame * 0.03) * 0.2;
  const isPriceUp = priceChange >= 0;

  // Calculate SVG path
  const width = 800;
  const height = 300;
  const padding = 40;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  const minPrice = Math.min(...priceData);
  const maxPrice = Math.max(...priceData);
  const priceRange = maxPrice - minPrice;

  const visiblePoints = Math.floor(priceData.length * drawProgress);

  const pathPoints = priceData.slice(0, visiblePoints).map((price, i) => {
    const x = padding + (i / (priceData.length - 1)) * chartWidth;
    const y =
      padding + chartHeight - ((price - minPrice) / priceRange) * chartHeight;
    return `${i === 0 ? "M" : "L"} ${x} ${y}`;
  });

  const linePath = pathPoints.join(" ");

  // Trade markers
  const tradeMarkers = [
    { x: 0.3, type: "buy", price: "$65" },
    { x: 0.6, type: "sell", price: "$67" },
    { x: 0.85, type: "buy", price: "$81" },
  ];

  return (
    <div className="relative w-full h-full p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <span className="text-xl font-semibold text-white">ETH/USD</span>
          <span className="font-mono text-2xl text-white">
            ${currentPrice.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
          <span
            className={`font-mono text-lg ${isPriceUp ? "text-profit" : "text-loss"}`}
          >
            {isPriceUp ? "+" : ""}
            {priceChange.toFixed(2)}%
          </span>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-profit" />
            <span className="text-sm text-gray-11">Buy</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-loss" />
            <span className="text-sm text-gray-11">Sell</span>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="relative h-[calc(100%-60px)]">
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
        >
          {/* Grid lines */}
          {[0, 1, 2, 3, 4].map((i) => (
            <line
              key={i}
              x1={padding}
              y1={padding + (i * chartHeight) / 4}
              x2={width - padding}
              y2={padding + (i * chartHeight) / 4}
              stroke="rgba(255, 255, 255, 0.05)"
              strokeWidth="1"
            />
          ))}

          {/* Price line gradient */}
          <defs>
            <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop
                offset="0%"
                stopColor={isPriceUp ? "#82D173" : "#FF66CC"}
                stopOpacity="0.5"
              />
              <stop
                offset="100%"
                stopColor={isPriceUp ? "#82D173" : "#FF66CC"}
              />
            </linearGradient>
            <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop
                offset="0%"
                stopColor={isPriceUp ? "#82D173" : "#FF66CC"}
                stopOpacity="0.2"
              />
              <stop
                offset="100%"
                stopColor={isPriceUp ? "#82D173" : "#FF66CC"}
                stopOpacity="0"
              />
            </linearGradient>
          </defs>

          {/* Area fill */}
          {visiblePoints > 1 && (
            <path
              d={`${linePath} L ${
                padding + ((visiblePoints - 1) / (priceData.length - 1)) * chartWidth
              } ${height - padding} L ${padding} ${height - padding} Z`}
              fill="url(#areaGradient)"
            />
          )}

          {/* Price line */}
          <path
            d={linePath}
            fill="none"
            stroke="url(#lineGradient)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        {/* Trade markers overlay */}
        {tradeMarkers.map((marker, i) => {
          const markerProgress = spring({
            frame,
            fps,
            delay: fps + i * 15,
            config: { damping: 15, stiffness: 80 },
          });

          const x = marker.x * 100;
          const y = marker.type === "buy" ? 70 : 30;

          return (
            <div
              key={i}
              className="absolute flex flex-col items-center"
              style={{
                left: `${x}%`,
                top: `${y}%`,
                transform: `translate(-50%, -50%) scale(${markerProgress})`,
                opacity: markerProgress,
              }}
            >
              <div
                className={`
                  flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold
                  ${marker.type === "buy" ? "bg-profit/20 text-profit" : "bg-loss/20 text-loss"}
                `}
              >
                <span>{marker.type === "buy" ? "↑" : "↓"}</span>
                <span>{marker.type.toUpperCase()}</span>
                <span className="font-mono">{marker.price}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom glow */}
      <div
        className="absolute bottom-0 left-0 right-0 h-20 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 50% 100% at 50% 100%, ${
            isPriceUp ? "rgba(130, 209, 115, 0.15)" : "rgba(255, 102, 204, 0.15)"
          }, transparent)`,
        }}
      />
    </div>
  );
};
