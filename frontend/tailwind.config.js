/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        panel: "#ffffff",
        surface: "#ffffff",
        border: "#e2e8f0",
        accent: "#2563eb",
        danger: "#dc2626",
        warn: "#ca8a04",
        ok: "#15803d",
      },
    },
  },
  plugins: [],
};
