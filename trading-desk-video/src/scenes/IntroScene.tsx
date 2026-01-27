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

export const IntroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Background grid animation
  const gridOpacity = interpolate(frame, [0, fps], [0, 0.15], {
    extrapolateRight: "clamp",
  });

  // Logo entrance
  const logoScale = spring({
    frame,
    fps,
    config: { damping: 15, stiffness: 80 },
  });

  const logoOpacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Title entrance (delayed)
  const titleProgress = spring({
    frame,
    fps,
    delay: 20,
    config: { damping: 200 },
  });

  const titleY = interpolate(titleProgress, [0, 1], [40, 0]);
  const titleOpacity = interpolate(titleProgress, [0, 1], [0, 1]);

  // Subtitle entrance (more delayed)
  const subtitleProgress = spring({
    frame,
    fps,
    delay: 35,
    config: { damping: 200 },
  });

  const subtitleY = interpolate(subtitleProgress, [0, 1], [30, 0]);
  const subtitleOpacity = interpolate(subtitleProgress, [0, 1], [0, 1]);

  // Tagline entrance
  const taglineProgress = spring({
    frame,
    fps,
    delay: 50,
    config: { damping: 200 },
  });

  // Glow pulse
  const glowIntensity = interpolate(
    Math.sin(frame * 0.08),
    [-1, 1],
    [0.3, 0.7]
  );

  return (
    <AbsoluteFill className="bg-gray-1 flex items-center justify-center overflow-hidden">
      {/* Animated background grid */}
      <div
        className="absolute inset-0"
        style={{
          opacity: gridOpacity,
          backgroundImage: `
            linear-gradient(rgba(16, 52, 166, 0.3) 1px, transparent 1px),
            linear-gradient(90deg, rgba(16, 52, 166, 0.3) 1px, transparent 1px)
          `,
          backgroundSize: "60px 60px",
        }}
      />

      {/* Center glow */}
      <div
        className="absolute w-[800px] h-[800px] rounded-full"
        style={{
          background: `radial-gradient(circle, rgba(16, 52, 166, ${glowIntensity * 0.4}) 0%, transparent 70%)`,
          transform: `scale(${1 + glowIntensity * 0.2})`,
        }}
      />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center">
        {/* Monmouth Logo */}
        <div
          style={{
            transform: `scale(${logoScale})`,
            opacity: logoOpacity,
          }}
        >
          <div className="w-48 h-48 flex items-center justify-center">
            <Img
              src={staticFile("mmjelly-black.png")}
              className="w-full h-full object-contain"
              style={{
                filter: "invert(1) drop-shadow(0 0 40px rgba(255,255,255,0.3))",
              }}
            />
          </div>
        </div>

        {/* Title */}
        <h1
          className="mt-10 text-7xl font-bold text-white tracking-tight"
          style={{
            transform: `translateY(${titleY}px)`,
            opacity: titleOpacity,
          }}
        >
          MONMOUTH
        </h1>

        {/* Subtitle */}
        <p
          className="mt-4 text-2xl text-gray-11 tracking-widest"
          style={{
            transform: `translateY(${subtitleY}px)`,
            opacity: subtitleOpacity,
          }}
        >
          AUTOMATED TRADING DESK
        </p>

        {/* Tagline */}
        <Sequence from={50} layout="none">
          <div
            className="mt-8 flex items-center gap-3 px-6 py-3 rounded-full border border-egyptian-blue/50 bg-egyptian-blue/10"
            style={{ opacity: taglineProgress }}
          >
            <span className="w-2 h-2 rounded-full bg-profit animate-pulse" />
            <span className="text-lg text-gray-12 font-mono">
              AI Agents on L2
            </span>
          </div>
        </Sequence>
      </div>

      {/* Bottom gradient */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-gray-1 to-transparent" />
    </AbsoluteFill>
  );
};
