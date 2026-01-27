import { Composition, Folder } from "remotion";
import { TradingDeskDemo } from "./TradingDeskDemo";
import { IntroScene } from "./scenes/IntroScene";
import { DashboardScene } from "./scenes/DashboardScene";
import { EscrowFlowScene } from "./scenes/EscrowFlowScene";
import { ReasoningScene } from "./scenes/ReasoningScene";
import { OutroScene } from "./scenes/OutroScene";
import "./style.css";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* Main Demo Video */}
      <Composition
        id="TradingDeskDemo"
        component={TradingDeskDemo}
        durationInFrames={900} // 30 seconds at 30fps
        fps={30}
        width={1920}
        height={1080}
      />

      {/* Individual Scenes for Preview */}
      <Folder name="Scenes">
        <Composition
          id="Intro"
          component={IntroScene}
          durationInFrames={150}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="Dashboard"
          component={DashboardScene}
          durationInFrames={180}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="EscrowFlow"
          component={EscrowFlowScene}
          durationInFrames={300}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="Reasoning"
          component={ReasoningScene}
          durationInFrames={180}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="Outro"
          component={OutroScene}
          durationInFrames={90}
          fps={30}
          width={1920}
          height={1080}
        />
      </Folder>
    </>
  );
};
