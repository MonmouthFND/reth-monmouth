import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Sequence,
} from "remotion";

const reasoningLines = [
  "Connecting to Monmouth L2...",
  "",
  "✓ Connected to chain 7750",
  "",
  "Creating escrow for market analysis...",
  "  Provider: 0x70997970...",
  "  Amount: 0.005 ETH",
  "  Timeout: 1 hour",
  "",
  "✓ Escrow created!",
  "  TX: 0x7f3a8b2c1d4e...",
  "",
  "🔬 Research Agent claiming escrow #47...",
  "✓ Claimed! TX: 0x8b4d2c1e...",
  "",
  "📊 Analyzing market...",
  "",
  "Market Analysis Results:",
  "  • Sentiment: BULLISH",
  "  • Confidence: 75%",
  "  • Support: $3,200",
  "  • Resistance: $3,400",
  "",
  "✓ Delivered! TX: 0x2c1e9d8f...",
  "",
  "💰 Releasing payment to Research Agent...",
  "✓ Released! TX: 0x9f8e7d6c...",
  "",
  "════════════════════════════════════",
  "✅ Demo flow complete!",
];

export const ReasoningScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Panel entrance
  const panelProgress = spring({
    frame,
    fps,
    config: { damping: 200 },
  });

  // Calculate visible lines (typewriter effect)
  const charsPerFrame = 2;
  const totalChars = frame * charsPerFrame;

  let charCount = 0;
  let visibleLines: string[] = [];
  let currentLinePartial = "";

  for (const line of reasoningLines) {
    if (charCount + line.length <= totalChars) {
      visibleLines.push(line);
      charCount += line.length + 1; // +1 for newline
    } else {
      const remaining = totalChars - charCount;
      if (remaining > 0) {
        currentLinePartial = line.slice(0, remaining);
      }
      break;
    }
  }

  // Decision button appears at end
  const showDecision = frame > 150;
  const decisionProgress = spring({
    frame,
    fps,
    delay: 150,
    config: { damping: 15, stiffness: 80 },
  });

  return (
    <AbsoluteFill className="bg-gray-1 p-12 overflow-hidden">
      {/* Background effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-egyptian-blue/5 via-transparent to-cyan-9/5" />

      {/* Grid */}
      <div
        className="absolute inset-0"
        style={{
          opacity: 0.03,
          backgroundImage: `
            linear-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.1) 1px, transparent 1px)
          `,
          backgroundSize: "30px 30px",
        }}
      />

      <div className="relative z-10 h-full flex gap-8">
        {/* Left side - Agent info */}
        <div
          className="w-1/3 flex flex-col gap-6"
          style={{
            transform: `translateX(${interpolate(panelProgress, [0, 1], [-30, 0])}px)`,
            opacity: panelProgress,
          }}
        >
          {/* Trader Agent */}
          <div className="p-6 rounded-2xl border border-gray-4 bg-gray-2/50">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-cyan-9/20 flex items-center justify-center">
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
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">
                  TRADER AGENT
                </h3>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-cyan-9" />
                  <span className="text-sm text-cyan-9">ANALYZING</span>
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-gray-9">Balance</p>
                <p className="font-mono text-white">9,995.32 ETH</p>
              </div>
              <div>
                <p className="text-xs text-gray-9">Today's P&L</p>
                <p className="font-mono text-profit">+$12.45</p>
              </div>
            </div>
          </div>

          {/* Research Agent */}
          <div className="p-6 rounded-2xl border border-gray-4 bg-gray-2/50">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-profit/20 flex items-center justify-center">
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
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">
                  RESEARCH AGENT
                </h3>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-profit" />
                  <span className="text-sm text-profit">WORKING</span>
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-gray-9">Balance</p>
                <p className="font-mono text-white">10,004.68 ETH</p>
              </div>
              <div>
                <p className="text-xs text-gray-9">Jobs Completed</p>
                <p className="font-mono text-white">47</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right side - Reasoning panel */}
        <div
          className="flex-1 rounded-2xl border border-gray-4 bg-gray-2/50 flex flex-col overflow-hidden"
          style={{
            transform: `translateX(${interpolate(panelProgress, [0, 1], [30, 0])}px)`,
            opacity: panelProgress,
          }}
        >
          {/* Header */}
          <div className="flex items-center gap-3 p-4 border-b border-gray-4">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#00D4FF"
              strokeWidth="1.5"
            >
              <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-2.54Z" />
              <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-2.54Z" />
            </svg>
            <h2 className="text-lg font-semibold text-white">AGENT REASONING</h2>
            <div className="flex items-center gap-1 ml-auto">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-2 h-2 rounded-full bg-cyan-9"
                  style={{
                    opacity: interpolate(
                      Math.sin((frame + i * 10) * 0.15),
                      [-1, 1],
                      [0.3, 1]
                    ),
                  }}
                />
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 p-6 font-mono text-sm overflow-hidden">
            {visibleLines.map((line, i) => (
              <div key={i} className="leading-relaxed">
                <HighlightedLine text={line} />
              </div>
            ))}
            {currentLinePartial && (
              <div className="leading-relaxed">
                <HighlightedLine text={currentLinePartial} />
                <span className="text-cyan-9 animate-pulse">▌</span>
              </div>
            )}
          </div>

          {/* Decision button */}
          {showDecision && (
            <div className="p-4 border-t border-gray-4">
              <div
                className="flex items-center gap-4 p-4 rounded-xl bg-profit/20 border border-profit/30"
                style={{
                  transform: `scale(${decisionProgress}) translateY(${interpolate(
                    decisionProgress,
                    [0, 1],
                    [10, 0]
                  )}px)`,
                  opacity: decisionProgress,
                }}
              >
                <span className="text-2xl">✅</span>
                <div>
                  <p className="text-lg font-semibold text-profit">
                    FLOW COMPLETE
                  </p>
                  <p className="text-sm text-gray-11">
                    Payment released successfully
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const HighlightedLine: React.FC<{ text: string }> = ({ text }) => {
  // Simple highlighting for key terms
  const highlighted = text
    .replace(/(✓|✅)/g, '<span class="text-profit">$1</span>')
    .replace(/(BULLISH)/g, '<span class="text-profit font-semibold">$1</span>')
    .replace(
      /(\$[\d,]+)/g,
      '<span class="text-cyan-9 font-semibold">$1</span>'
    )
    .replace(/(0x[a-f0-9.]+)/gi, '<span class="text-cyan-9">$1</span>')
    .replace(/(📊|🔬|💰)/g, '<span class="text-lg">$1</span>');

  return (
    <span
      className="text-gray-11"
      dangerouslySetInnerHTML={{ __html: highlighted || "&nbsp;" }}
    />
  );
};
