import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

// Dark is the product's default look; light is opt-in and remembered.
//
// Deliberately NOT seeded from prefers-color-scheme: the ask was dark by
// default for everyone, with the toggle as the override. Reading the OS
// setting would make first impressions inconsistent across machines.

export type Theme = "dark" | "light";

const STORAGE_KEY = "alta_theme";

interface ThemeState {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeState | null>(null);

function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  return window.localStorage.getItem(STORAGE_KEY) === "light" ? "light" : "dark";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(readStoredTheme);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    // Drives the browser's own chrome (form controls, scrollbars) so they
    // don't stay light against a dark page.
    root.style.colorScheme = theme;
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  return (
    <ThemeContext.Provider
      value={{ theme, toggleTheme: () => setTheme((t) => (t === "dark" ? "light" : "dark")) }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
