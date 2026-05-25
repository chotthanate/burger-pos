/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "Noto Sans Thai", "Leelawadee UI", "Tahoma", "sans-serif"],
      },
      colors: {
        ink: "#172033",
        line: "#d8dee8",
        soft: "#f5f7fa",
        burger: "#136f63",
        warning: "#d97706",
        danger: "#dc2626",
      },
      boxShadow: {
        soft: "0 10px 30px rgba(20, 28, 44, 0.08)",
      },
    },
  },
  plugins: [],
};
