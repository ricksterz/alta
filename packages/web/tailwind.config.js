/** @type {import('tailwindcss').Config} */
export default {
  // Class-based rather than media-based: the app defaults to dark regardless
  // of OS setting, and the toggle has to be able to override the OS either
  // way. `media` would make the user's choice unenforceable.
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        caveat: ['"Caveat"', "cursive"],
        display: ['"Space Grotesk"', "sans-serif"],
      },
    },
  },
  plugins: [],
};
