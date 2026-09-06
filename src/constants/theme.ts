export type ThemePalette = {
  text: string;
  textSecondary: string;
  textPrimary: string;
  background: string;
  backgroundElement: string;
  surface: string;
  surfaceElevated: string;
  backgroundSelected: string;
  primary: string;
  primaryDark: string;
  primaryLight: string;
  primaryMuted: string;
  backgroundbutton: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
  securityScore: string;
  securityScoreBg: string;
  actionCard: string;
  actionIconBg: string;
  alertDangerBg: string;
  alertWarningBg: string;
  border: string;
  inputBackground: string;
  inputBorder: string;
  tabInactive: string;
  tabActive: string;
};

export type ThemePaletteName = 'light' | 'dark' | 'oled';

export const Colors: Record<ThemePaletteName, ThemePalette> = {
  light: {
    // Text
    text: '#111827',
    textSecondary: '#6B7280',
    textPrimary: '#111827',

    // Backgrounds
    background: '#F8FAF9',
    backgroundElement: '#FFFFFF',
    surface: '#FFFFFF',
    surfaceElevated: '#FFFFFF',
    backgroundSelected: '#E8F2EC',

    // Brand Colors
    primary: '#065F46',
    primaryDark: '#044E3A',
    primaryLight: '#10B981',
    primaryMuted: '#DFF4EA',

    // Buttons
    backgroundbutton: '#065F46',

    // Status Colors
    success: '#168B6A',
    warning: '#F59E0B',
    danger: '#B94A4A',
    info: '#3B82F6',

    // Dashboard Cards
    securityScore: '#B7812B',
    securityScoreBg: '#FEF3C7',

    // Quick Actions
    actionCard: '#EDF4F0',
    actionIconBg: '#064737',

    // Alerts
    alertDangerBg: '#FEE2E2',
    alertWarningBg: '#FEF3C7',

    // Borders
    border: '#E5E7EB',

    // Inputs
    inputBackground: '#FFFFFF',
    inputBorder: '#D1D5DB',

    // Tab Bar
    tabInactive: '#6B7280',
    tabActive: '#065F46',
  },

  dark: {
    // Text
    text: '#FFFFFF',
    textSecondary: '#A7B0BE',
    textPrimary: '#F9FAFB',

    // Backgrounds
    background: '#0A0F14',
    backgroundElement: '#111827',
    surface: '#111827',
    surfaceElevated: '#1A2330',
    backgroundSelected: '#1F2937',

    // Brand Colors
    primary: '#0B6B50',
    primaryDark: '#064737',
    primaryLight: '#168B6A',
    primaryMuted: '#102E26',

    // Buttons
    backgroundbutton: '#065F46',

    // Status Colors
    success: '#168B6A',
    warning: '#B7812B',
    danger: '#B94A4A',
    info: '#5077A8',

    // Dashboard Cards
    securityScore: '#B7812B',
    securityScoreBg: '#3D2C06',

    // Quick Actions
    actionCard: '#161F2B',
    actionIconBg: '#064737',

    // Alerts
    alertDangerBg: '#2A1214',
    alertWarningBg: '#2B2314',

    // Borders
    border: '#2A3441',

    // Inputs
    inputBackground: '#111827',
    inputBorder: '#374151',

    // Tab Bar
    tabInactive: '#D1D5DB',
    tabActive: '#0B6B50',
  },

  oled: {
    // Text
    text: '#FFFFFF',
    textSecondary: '#A9B4C2',
    textPrimary: '#FFFFFF',

    // Backgrounds
    background: '#000000',
    backgroundElement: '#050A08',
    surface: '#050A08',
    surfaceElevated: '#0A1610',
    backgroundSelected: '#06130F',

    // Brand Colors
    primary: '#07543F',
    primaryDark: '#043B2D',
    primaryLight: '#0E7457',
    primaryMuted: '#051F18',

    // Buttons
    backgroundbutton: '#065F46',

    // Status Colors
    success: '#0E7457',
    warning: '#946A27',
    danger: '#9F4147',
    info: '#3F628D',

    // Dashboard Cards
    securityScore: '#946A27',
    securityScoreBg: '#18130A',

    // Quick Actions
    actionCard: '#050D0A',
    actionIconBg: '#043B2D',

    // Alerts
    alertDangerBg: '#1C0A0B',
    alertWarningBg: '#18130A',

    // Borders
    border: '#18231F',

    // Inputs
    inputBackground: '#050A08',
    inputBorder: '#1F2A25',

    // Tab Bar
    tabInactive: '#D1D5DB',
    tabActive: '#07543F',
  }
};