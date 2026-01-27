import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Sequence,
} from "remotion";

type FlowStep = {
  title: string;
  description: string;
  icon: string;
  color: string;
};

const flowSteps: FlowStep[] = [
  {
    title: "1. Create Escrow",
    description: "Trader creates escrow with payment",
    icon: "📋",
    color: "cyan-9",
  },
  {
    title: "2. Claim Job",
    description: "Research agent claims the task",
    icon: "✋",
    color: "warning",
  },
  {
    title: "3. Deliver Result",
    description: "Analysis delivered on-chain",
    icon: "📊",
    color: "egyptian-blue",
  },
  {
    title: "4. Release Payment",
    description: "Funds released to provider",
    icon: "💰",
    color: "profit",
  },
];

export const EscrowFlowScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Title entrance
  const titleProgress = spring({
    frame,
    fps,
    config: { damping: 200 },
  });

  // Calculate which step is active
  const stepDuration = 60; // frames per step
  const currentStepIndex = Math.min(
    Math.floor((frame - 30) / stepDuration),
    flowSteps.length - 1
  );

  return (
    <AbsoluteFill className="bg-gray-1 overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-egyptian-blue/10 via-transparent to-profit/5" />

      {/* Grid pattern */}
      <div
        className="absolute inset-0"
        style={{
          opacity: 0.05,
          backgroundImage: `
            linear-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.1) 1px, transparent 1px)
          `,
          backgroundSize: "60px 60px",
        }}
      />

      {/* Title */}
      <Sequence from={0} layout="none">
        <div
          className="absolute top-16 left-0 right-0 text-center"
          style={{
            transform: `translateY(${interpolate(titleProgress, [0, 1], [-30, 0])}px)`,
            opacity: titleProgress,
          }}
        >
          <h2 className="text-5xl font-bold text-white mb-4">
            Agent-to-Agent Escrow
          </h2>
          <p className="text-xl text-gray-11">
            Trustless payments between AI agents on Monmouth L2
          </p>
        </div>
      </Sequence>

      {/* Flow diagram */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-8 mt-10">
        {flowSteps.map((step, index) => {
          const stepDelay = 30 + index * stepDuration;
          const stepProgress = spring({
            frame,
            fps,
            delay: stepDelay,
            config: { damping: 15, stiffness: 80 },
          });

          const isActive = frame >= stepDelay && currentStepIndex >= index;
          const isPast = currentStepIndex > index;

          return (
            <Sequence from={stepDelay} layout="none" key={index}>
              <div className="flex items-center">
                {/* Step card */}
                <div
                  className={`
                    relative w-56 p-6 rounded-2xl border-2 transition-colors
                    ${isActive ? `border-${step.color} bg-gray-2` : "border-gray-4 bg-gray-3/50"}
                  `}
                  style={{
                    transform: `scale(${stepProgress}) translateY(${interpolate(stepProgress, [0, 1], [20, 0])}px)`,
                    opacity: stepProgress,
                    boxShadow: isActive
                      ? `0 0 40px rgba(var(--${step.color}-rgb), 0.3)`
                      : "none",
                  }}
                >
                  {/* Icon */}
                  <div className="text-4xl mb-4">{step.icon}</div>

                  {/* Title */}
                  <h3 className="text-lg font-semibold text-white mb-2">
                    {step.title}
                  </h3>

                  {/* Description */}
                  <p className="text-sm text-gray-11">{step.description}</p>

                  {/* Active indicator */}
                  {isActive && !isPast && (
                    <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-profit">
                      <div className="absolute inset-0 rounded-full bg-profit animate-ping" />
                    </div>
                  )}

                  {/* Completed checkmark */}
                  {isPast && (
                    <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-profit flex items-center justify-center">
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="white"
                        strokeWidth="3"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                  )}
                </div>

                {/* Arrow connector */}
                {index < flowSteps.length - 1 && (
                  <Sequence from={stepDelay + 30} layout="none">
                    <div
                      className="w-16 h-0.5 bg-gradient-to-r from-gray-4 to-egyptian-blue mx-2"
                      style={{
                        opacity: spring({
                          frame,
                          fps,
                          delay: stepDelay + 30,
                          config: { damping: 200 },
                        }),
                        transform: `scaleX(${spring({
                          frame,
                          fps,
                          delay: stepDelay + 30,
                          config: { damping: 200 },
                        })})`,
                      }}
                    />
                  </Sequence>
                )}
              </div>
            </Sequence>
          );
        })}
      </div>

      {/* Transaction hashes appearing */}
      <Sequence from={90} layout="none">
        <div
          className="absolute bottom-20 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
          style={{
            opacity: spring({ frame, fps, delay: 90, config: { damping: 200 } }),
          }}
        >
          <p className="text-sm text-gray-9 mb-2">On-chain transactions</p>
          <div className="flex gap-4">
            {["0x7f3a...e2c1", "0x8b4d...f3a2", "0x2c1e...9d8f"].map(
              (hash, i) => (
                <Sequence from={90 + i * 20} layout="none" key={hash}>
                  <div
                    className="px-4 py-2 rounded-lg bg-gray-3 border border-gray-4 font-mono text-sm text-cyan-9"
                    style={{
                      opacity: spring({
                        frame,
                        fps,
                        delay: 90 + i * 20,
                        config: { damping: 200 },
                      }),
                      transform: `translateY(${interpolate(
                        spring({
                          frame,
                          fps,
                          delay: 90 + i * 20,
                          config: { damping: 200 },
                        }),
                        [0, 1],
                        [10, 0]
                      )}px)`,
                    }}
                  >
                    {hash}
                  </div>
                </Sequence>
              )
            )}
          </div>
        </div>
      </Sequence>
    </AbsoluteFill>
  );
};
