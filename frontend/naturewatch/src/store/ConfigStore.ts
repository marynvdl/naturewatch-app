import { defineStore } from 'pinia';

/** Config State */
interface ConfigState {
  /** Dark Theme mode */
  _themeDark: boolean;
  /** Satellite Theme mode (overrules themeDark) */
  _themeSatellite: boolean;
  /** Language */
  _locale: string;
}

/** Config Store */
export default defineStore('config', {
  // Default Config State
  state: (): ConfigState => ({
    _themeDark: window.matchMedia('(prefers-color-scheme: dark)').matches,
    _themeSatellite: true,
    _locale:
      (window.navigator.languages && window.navigator.languages[0]) ||
      window.navigator.language,
  }),
  // Getters
  getters: {
    themeDark: (s): boolean => s._themeDark,
    themeSatellite: (s): boolean => s._themeSatellite,
    locale: (s): string => s._locale,
  },
  // Actions
  actions: {
    /** Toggle Dark/Light mode */
    toggleTheme() {
      this._themeDark = !this._themeDark;
    },
    /** Toggle Satellite mode */
    toggleSatelliteTheme() {
      this._themeSatellite = !this._themeSatellite;
    },
    /**
     * Set Locale.
     * @param locale
     */
    setLocale(locale: string): void {
      this._locale = locale;
    },
  },
  // Data persistence destination
  persist: {
    key: import.meta.env.VITE_APP_WEBSTORAGE_NAMESPACE || 'naturewatch',
    storage: window.sessionStorage,
  },
});
