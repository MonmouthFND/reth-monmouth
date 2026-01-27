/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Monmouth brand colors
        "egyptian-blue": "#1034A6",
        "egyptian-blue-light": "#1a4bc9",
        profit: "#82D173",
        loss: "#FF66CC",
        warning: "#FFB347",
        blocked: "#FF4444",
        cyan: {
          9: "#00D4FF",
        },
        gray: {
          1: "#0a0a0b",
          2: "#111113",
          3: "#18181b",
          4: "#1f1f23",
          5: "#27272a",
          9: "#71717a",
          11: "#a1a1aa",
          12: "#fafafa",
        },
      },
      fontFamily: {
        mono: ["JetBrains Mono", "monospace"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
