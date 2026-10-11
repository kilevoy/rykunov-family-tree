// Маппинг токенов в Tailwind: компоненты используют bg-surface, text-muted и т.д., без hex.
import type { Config } from "tailwindcss";
import tokens from "./tokens.json";

const c = tokens.color;
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    colors: {
      transparent: "transparent",
      current: "currentColor",
      bg: c.bg,
      surface: c.surface,
      border: c.border,
      "border-input": c["border-input"],
      text: c.text,
      muted: c["text-muted"],
      accent: c.accent,
      "on-accent": c["on-accent"],
      danger: c.danger,
      success: c.success,
      warning: c.warning,
      selected: c.selected,
      "card-male": c["card-male"],
      "card-female": c["card-female"],
      "card-unknown": c["card-unknown"],
      "tree-band": c["tree-band"],
      "on-card": c["on-card"],
      "disabled-bg": c["disabled-bg"],
      "disabled-text": c["disabled-text"],
      private: c.private,
    },
    fontFamily: { sans: [tokens.font.sans], serif: [tokens.font.serif], mono: [tokens.font.mono] },
    fontSize: Object.fromEntries(
      Object.entries(tokens.type).map(([k, v]) => [k, [`${v.size}px`, { lineHeight: `${v.line}px`, fontWeight: String(v.weight) }]])
    ),
    spacing: Object.fromEntries(tokens.space.map((v, i) => [String(i), `${v}px`])),
    borderRadius: Object.fromEntries(Object.entries(tokens.radius).map(([k, v]) => [k, `${v}px`])),
    boxShadow: tokens.shadow,
    extend: {
      transitionDuration: { fast: tokens.motion.fast, base: tokens.motion.base },
      transitionTimingFunction: { DEFAULT: tokens.motion.ease },
      maxWidth: { content: `${tokens.layout["content-max"]}px` },
    },
  },
  plugins: [],
};
export default config;
