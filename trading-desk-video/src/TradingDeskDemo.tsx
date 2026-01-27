import { AbsoluteFill, Series } from "remotion";
import { IntroScene } from "./scenes/IntroScene";
import { DashboardScene } from "./scenes/DashboardScene";
import { EscrowFlowScene } from "./scenes/EscrowFlowScene";
import { ReasoningScene } from "./scenes/ReasoningScene";
import { OutroScene } from "./scenes/OutroScene";

export const TradingDeskDemo: React.FC = () => {
  return (
    <AbsoluteFill className="bg-gray-1">
      <Series>
        {/* Scene 1: Intro with logo and title */}
        <Series.Sequence durationInFrames={150}>
          <IntroScene />
        </Series.Sequence>

        {/* Scene 2: Dashboard overview with animated elements */}
        <Series.Sequence durationInFrames={180} offset={-15}>
          <DashboardScene />
        </Series.Sequence>

        {/* Scene 3: Escrow flow animation */}
        <Series.Sequence durationInFrames={300} offset={-15}>
          <EscrowFlowScene />
        </Series.Sequence>

        {/* Scene 4: Agent reasoning showcase */}
        <Series.Sequence durationInFrames={180} offset={-15}>
          <ReasoningScene />
        </Series.Sequence>

        {/* Scene 5: Outro with CTA */}
        <Series.Sequence durationInFrames={90} offset={-15}>
          <OutroScene />
        </Series.Sequence>
      </Series>
    </AbsoluteFill>
  );
};
