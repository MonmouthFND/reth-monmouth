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

export const OutroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Logo entrance
  const logoProgress = spring({
    frame,
    fps,
    config: { damping: 15, stiffness: 80 },
  });

  // Text fade
  const textProgress = spring({
    frame,
    fps,
    delay: 15,
    config: { damping: 200 },
  });

  // Features stagger
  const features = [
    "Agent-aware transaction pool",
    "On-chain escrow settlement",
    "Prague-activated at genesis",
  ];

  // Glow pulse
  const glowIntensity = interpolate(
    Math.sin(frame * 0.1),
    [-1, 1],
    [0.2, 0.5]
  );

  return (
    <AbsoluteFill className="bg-gray-1 flex items-center justify-center overflow-hidden">
      {/* Background gradient */}
      <div
        className="absolute w-[1000px] h-[1000px] rounded-full"
        style={{
          background: `radial-gradient(circle, rgba(16, 52, 166, ${glowIntensity}) 0%, transparent 60%)`,
        }}
      />

      {/* Grid pattern */}
      <div
        className="absolute inset-0"
        style={{
          opacity: 0.1,
          backgroundImage: `
            linear-gradient(rgba(16, 52, 166, 0.5) 1px, transparent 1px),
            linear-gradient(90deg, rgba(16, 52, 166, 0.5) 1px, transparent 1px)
          `,
          backgroundSize: "80px 80px",
        }}
      />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center">
        {/* Logo */}
        <div
          style={{
            transform: `scale(${logoProgress})`,
            opacity: logoProgress,
          }}
        >
          <div className="w-40 h-40 flex items-center justify-center">
            <Img
              src={staticFile("mmjelly-black.png")}
              className="w-full h-full object-contain"
              style={{
                filter: "invert(1) drop-shadow(0 0 30px rgba(255,255,255,0.2))",
              }}
            />
          </div>
        </div>

        {/* Title */}
        <h1
          className="mt-8 text-5xl font-bold text-white"
          style={{
            transform: `translateY(${interpolate(textProgress, [0, 1], [20, 0])}px)`,
            opacity: textProgress,
          }}
        >
          MONMOUTH L2
        </h1>

        {/* Tagline */}
        <p
          className="mt-4 text-xl text-gray-11"
          style={{
            transform: `translateY(${interpolate(textProgress, [0, 1], [20, 0])}px)`,
            opacity: textProgress,
          }}
        >
          Where AI agents transact safely
        </p>

        {/* Features */}
        <Sequence from={25} layout="none">
          <div className="mt-8 flex gap-6">
            {features.map((feature, i) => (
              <Sequence from={i * 8} layout="none" key={feature}>
                <div
                  className="flex items-center gap-2 px-4 py-2 rounded-full bg-gray-3 border border-gray-4"
                  style={{
                    opacity: spring({
                      frame,
                      fps,
                      delay: 25 + i * 8,
                      config: { damping: 200 },
                    }),
                    transform: `translateY(${interpolate(
                      spring({
                        frame,
                        fps,
                        delay: 25 + i * 8,
                        config: { damping: 200 },
                      }),
                      [0, 1],
                      [10, 0]
                    )}px)`,
                  }}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-profit" />
                  <span className="text-sm text-gray-12">{feature}</span>
                </div>
              </Sequence>
            ))}
          </div>
        </Sequence>

        {/* CTA */}
        <Sequence from={50} layout="none">
          <div
            className="mt-10 px-8 py-4 rounded-xl bg-egyptian-blue text-white font-semibold text-lg"
            style={{
              opacity: spring({
                frame,
                fps,
                delay: 50,
                config: { damping: 200 },
              }),
              transform: `scale(${spring({
                frame,
                fps,
                delay: 50,
                config: { damping: 15, stiffness: 80 },
              })})`,
              boxShadow: `0 0 40px rgba(16, 52, 166, ${glowIntensity})`,
            }}
          >
            github.com/MonmouthFND
          </div>
        </Sequence>
      </div>
    </AbsoluteFill>
  );
};
