/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        forge: {
          bg: "#0a0a0f",
          panel: "#12121a",
          border: "#2a2a3a",
          accent: "#e8a830",
          danger: "#c0392b",
          safe: "#27ae60",
          text: "#c8c8d8",
          dim: "#606070",
        },
      },
      fontFamily: {
        mono: ["'Courier New'", "Courier", "monospace"],
      },
    },
  },
  plugins: [],
};
