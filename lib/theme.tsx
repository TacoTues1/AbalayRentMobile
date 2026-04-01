import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from "react";
import { useColorScheme } from "react-native";

export const darkColors = {
  background: "#212121",
  surface: "#2b2b2b",
  card: "#333333",
  cardBorder: "#444444",
  text: "#f0f0f5",
  textSecondary: "#b0b8c8",
  textMuted: "#8a8a8a",
  border: "#3e3e3e",
  inputBg: "#333333",
  inputBorder: "#4a4a4a",
  accent: "#5b9aff",
  headerBg: "#272727",
  tabBarBg: "#272727",
  tabBarBorder: "#3a3a3a",
  iconDefault: "#8a8a8a",
  iconActive: "#ffffff",
  badge: "#3a3a3a",
  overlay: "rgba(20,20,20,0.85)",
  shadow: "#111111",
  danger: "#f87171",
  success: "#34d399",
  warning: "#fbbf24",
};

export const lightColors = {
  background: "#f9fafb",
  surface: "#ffffff",
  card: "#ffffff",
  cardBorder: "#f3f4f6",
  text: "#111111",
  textSecondary: "#666666",
  textMuted: "#9ca3af",
  border: "#e5e7eb",
  inputBg: "#ffffff",
  inputBorder: "#dddddd",
  accent: "#3b82f6",
  headerBg: "#ffffff",
  tabBarBg: "#ffffff",
  tabBarBorder: "#E8E8E8",
  iconDefault: "#999999",
  iconActive: "#000000",
  badge: "#f3f4f6",
  overlay: "rgba(0,0,0,0.5)",
  shadow: "#000000",
  danger: "#ef4444",
  success: "#10b981",
  warning: "#f59e0b",
};

type ThemeColors = typeof darkColors;
export type ThemeMode = "light" | "dark" | "auto";
const THEME_MODE_STORAGE_KEY = "themeMode";

const normalizeThemeMode = (value: string | null): ThemeMode | null => {
  if (!value) return null;
  const normalized = value.toLowerCase();
  if (
    normalized === "light" ||
    normalized === "dark" ||
    normalized === "auto"
  ) {
    return normalized;
  }

  // Backward compatibility with older stored values.
  if (normalized === "on" || normalized === "true") return "dark";
  if (normalized === "off" || normalized === "false") return "light";
  return null;
};

interface ThemeContextType {
  isDark: boolean;
  colors: ThemeColors;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  toggleTheme: () => void; // kept for backward compat
}

const ThemeContext = createContext<ThemeContextType>({
  isDark: false,
  colors: lightColors,
  themeMode: "auto",
  setThemeMode: () => {},
  toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme(); // 'light' | 'dark' | null
  const [themeMode, setThemeModeState] = useState<ThemeMode>("auto");

  useEffect(() => {
    let isMounted = true;

    const loadThemeMode = async () => {
      try {
        const storedValue = await AsyncStorage.getItem(THEME_MODE_STORAGE_KEY);
        const parsedMode = normalizeThemeMode(storedValue);
        if (parsedMode && isMounted) {
          setThemeModeState(parsedMode);
        }

        // Migrate legacy values to the current format.
        if (parsedMode && storedValue !== parsedMode) {
          await AsyncStorage.setItem(THEME_MODE_STORAGE_KEY, parsedMode);
        }
      } catch {
        // Keep default mode when storage access fails.
      }
    };

    loadThemeMode();

    return () => {
      isMounted = false;
    };
  }, []);

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);
    void AsyncStorage.setItem(THEME_MODE_STORAGE_KEY, mode);
  }, []);

  // Resolve isDark based on mode
  const isDark =
    themeMode === "dark"
      ? true
      : themeMode === "light"
        ? false
        : systemScheme === "dark"; // auto follows system

  // Legacy toggle: cycles light -> dark -> auto
  const toggleTheme = useCallback(() => {
    if (themeMode === "light") setThemeMode("dark");
    else if (themeMode === "dark") setThemeMode("auto");
    else setThemeMode("light");
  }, [themeMode, setThemeMode]);

  const colors = useMemo(() => (isDark ? darkColors : lightColors), [isDark]);
  const contextValue = useMemo(
    () => ({
      isDark,
      colors,
      themeMode,
      setThemeMode,
      toggleTheme,
    }),
    [isDark, colors, themeMode, setThemeMode, toggleTheme],
  );

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
