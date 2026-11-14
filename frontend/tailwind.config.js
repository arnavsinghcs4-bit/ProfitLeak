/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#101210",
        surface: "#151815",
        elevated: "#1C211C",
        border: {
          DEFAULT: "#2B312B",
          subtle: "#232823",
        },
        ink: {
          DEFAULT: "#F0F1E9",
          muted: "#969D93",
          faint: "#6B736A",
        },
        accent: {
          DEFAULT: "#C7F36B",
          dim: "#9DBF52",
        },
        loss: {
          DEFAULT: "#E5654F",
          dim: "#8A3B2E",
        },
        gain: {
          DEFAULT: "#5FB87A",
          dim: "#2E5C3D",
        },
        warn: {
          DEFAULT: "#D9A441",
        },
      },
      fontFamily: {
        sans: ['"Inter"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', '"SFMono-Regular"', "Consolas", "monospace"],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
      tabular: {
        nums: { fontVariantNumeric: "tabular-nums" },
      },
    },
  },
  plugins: [],
};