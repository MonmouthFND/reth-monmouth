import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Sequence,
  Img,
  staticFile,
} from "remotion";
import { PriceChartMock } from "../components/PriceChartMock";
import { AgentCard } from "../components/AgentCard";
import { StatCard } from "../components/StatCard";

export const DashboardScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Panel entrance animations
  const panelProgress = spring({
    frame,
    fps,
    config: { damping: 200 },
  });

  const fadeIn = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill className="bg-gray-1 p-8 overflow-hidden">
      {/* Background grid */}
      <div
        className="absolute inset-0"
        style={{
          opacity: 0.05,
          backgroundImage: `
            linear-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.1) 1px, transparent 1px)
          `,
          backgroundSize: "40px 40px",
        }}
      />

      {/* Header */}
      <Sequence from={0} layout="none">
        <div
          className="relative z-10 flex justify-between items-center mb-6"
          style={{ opacity: fadeIn }}
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 flex items-center justify-center">
              <Img
                src={staticFile("mmjelly-black.png")}
                className="w-full h-full object-contain"
                style={{ filter: "invert(1)" }}
              />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Trading Desk</h1>
              <p className="text-sm text-gray-9">Monmouth L2 • Chain ID 7750</p>
            </div>
          </div>

          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-profit/20 border border-profit/30">
            <span className="w-2 h-2 rounded-full bg-profit" />
            <span className="text-profit font-mono text-sm">LIVE</span>
          </div>
        </div>
      </Sequence>

      {/* Main grid */}
      <div className="relative z-10 grid grid-cols-4 grid-rows-2 gap-4 h-[calc(100%-80px)]">
        {/* Chart - 3 cols, 1 row */}
        <Sequence from={10} layout="none">
          <div
            className="col-span-3 row-span-1 rounded-xl border border-gray-4 bg-gray-2/50 overflow-hidden"
            style={{
              transform: `translateY(${interpolate(panelProgress, [0, 1], [30, 0])}px)`,
              opacity: panelProgress,
            }}
          >
            <PriceChartMock />
          </div>
        </Sequence>

        {/* Trader Agent Card - 1 col, 1 row */}
        <Sequence from={20} layout="none">
          <div
            className="col-span-1 row-span-1"
            style={{
              transform: `translateX(${interpolate(
                spring({ frame, fps, delay: 20, config: { damping: 200 } }),
                [0, 1],
                [30, 0]
              )}px)`,
              opacity: spring({ frame, fps, delay: 20, config: { damping: 200 } }),
            }}
          >
            <AgentCard
              type="trader"
              did="did:key:0xf39Fd6e51aad88F6F..."
              balance="9,995.32 ETH"
              status="analyzing"
            />
          </div>
        </Sequence>

        {/* Stats Row - 3 cols, 1 row */}
        <Sequence from={30} layout="none">
          <div
            className="col-span-3 row-span-1 grid grid-cols-3 gap-4"
            style={{
              transform: `translateY(${interpolate(
                spring({ frame, fps, delay: 30, config: { damping: 200 } }),
                [0, 1],
                [30, 0]
              )}px)`,
              opacity: spring({ frame, fps, delay: 30, config: { damping: 200 } }),
            }}
          >
            <StatCard
              label="Total Escrows"
              value="47"
              trend={12}
              icon="escrow"
            />
            <StatCard
              label="Volume Locked"
              value="1,234 ETH"
              trend={8.5}
              icon="lock"
            />
            <StatCard
              label="Trades Today"
              value="23"
              trend={-3}
              icon="trade"
            />
          </div>
        </Sequence>

        {/* Research Agent Card - 1 col, 1 row */}
        <Sequence from={40} layout="none">
          <div
            className="col-span-1 row-span-1"
            style={{
              transform: `translateX(${interpolate(
                spring({ frame, fps, delay: 40, config: { damping: 200 } }),
                [0, 1],
                [30, 0]
              )}px)`,
              opacity: spring({ frame, fps, delay: 40, config: { damping: 200 } }),
            }}
          >
            <AgentCard
              type="research"
              did="did:key:0x70997970C51812dc3..."
              balance="10,004.68 ETH"
              status="available"
            />
          </div>
        </Sequence>
      </div>
    </AbsoluteFill>
  );
};
