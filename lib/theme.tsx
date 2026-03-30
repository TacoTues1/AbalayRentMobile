import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';

export const darkColors = {
    background: '#212121',
    surface: '#2b2b2b',
    card: '#333333',
    cardBorder: '#444444',
    text: '#f0f0f5',
    textSecondary: '#b0b8c8',
    textMuted: '#8a8a8a',
    border: '#3e3e3e',
    inputBg: '#333333',
    inputBorder: '#4a4a4a',
    accent: '#5b9aff',
    headerBg: '#272727',
    tabBarBg: '#272727',
    tabBarBorder: '#3a3a3a',
    iconDefault: '#8a8a8a',
    iconActive: '#ffffff',
    badge: '#3a3a3a',
    overlay: 'rgba(20,20,20,0.85)',
    shadow: '#111111',
    danger: '#f87171',
    success: '#34d399',
    warning: '#fbbf24',
};

export const lightColors = {
    background: '#f9fafb',
    surface: '#ffffff',
    card: '#ffffff',
    cardBorder: '#f3f4f6',
    text: '#111111',
    textSecondary: '#666666',
    textMuted: '#9ca3af',
    border: '#e5e7eb',
    inputBg: '#ffffff',
    inputBorder: '#dddddd',
    accent: '#3b82f6',
    headerBg: '#ffffff',
    tabBarBg: '#ffffff',
    tabBarBorder: '#E8E8E8',
    iconDefault: '#999999',
    iconActive: '#000000',
    badge: '#f3f4f6',
    overlay: 'rgba(0,0,0,0.5)',
    shadow: '#000000',
    danger: '#ef4444',
    success: '#10b981',
    warning: '#f59e0b',
};

type ThemeColors = typeof darkColors;
export type ThemeMode = 'light' | 'dark' | 'auto';

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
    themeMode: 'auto',
    setThemeMode: () => { },
    toggleTheme: () => { },
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const systemScheme = useColorScheme(); // 'light' | 'dark' | null
    const [themeMode, setThemeModeState] = useState<ThemeMode>('auto');
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        AsyncStorage.getItem('themeMode').then((val) => {
            if (val === 'dark' || val === 'light' || val === 'auto') {
                setThemeModeState(val);
            }
            setLoaded(true);
        });
    }, []);

    const setThemeMode = (mode: ThemeMode) => {
        setThemeModeState(mode);
        AsyncStorage.setItem('themeMode', mode);
    };

    // Resolve isDark based on mode
    const isDark =
        themeMode === 'dark' ? true :
            themeMode === 'light' ? false :
                systemScheme === 'dark'; // auto follows system

    // Legacy toggle: cycles light -> dark -> auto
    const toggleTheme = () => {
        if (themeMode === 'light') setThemeMode('dark');
        else if (themeMode === 'dark') setThemeMode('auto');
        else setThemeMode('light');
    };

    const colors = isDark ? darkColors : lightColors;

    return (
        <ThemeContext.Provider value={{ isDark, colors, themeMode, setThemeMode, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export const useTheme = () => useContext(ThemeContext);
