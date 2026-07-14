"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const STORAGE_KEY = "3star-theme";

const ThemeContext = createContext<ThemeContextValue>({
  theme: "light",
  toggleTheme: () => undefined,
  setTheme: () => undefined,
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Starts at the same "light" default the server renders and the <html> tag
  // hardcodes, then corrects from the DOM (already set by the inline init
  // script) once mounted. Reading the DOM during the initial render instead
  // would match the script's value on the client's first pass but not the
  // server-rendered markup, causing a hydration mismatch on this state.
  const [theme, setThemeState] = useState<Theme>("light");

  useEffect(() => {
    // Defer the DOM-to-state synchronization until after the current paint to
    // avoid a cascading synchronous render inside the effect.
    const frame = window.requestAnimationFrame(() => {
      const current = document.documentElement.getAttribute("data-theme");
      setThemeState(current === "dark" ? "dark" : "light");
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const applyTheme = useCallback((next: Theme) => {
    document.documentElement.setAttribute("data-theme", next);
    window.localStorage.setItem(STORAGE_KEY, next);
    setThemeState(next);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      toggleTheme: () => applyTheme(theme === "dark" ? "light" : "dark"),
      setTheme: applyTheme,
    }),
    [theme, applyTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
