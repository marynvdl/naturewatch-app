/**
 * Vuetify3 Plugin
 */
import { aliases, mdi } from 'vuetify/iconsets/mdi';
import { createVuetify } from 'vuetify';
import type { ThemeDefinition } from 'vuetify';

// For test use. Do not include createVuetify()
// see https://next.vuetifyjs.com/en/features/treeshaking/
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';

// Translations provided by Vuetify
import { en } from 'vuetify/locale';

// Misc
import { loadFonts } from './webfontloader';
loadFonts();

// Styles
import 'vuetify/styles';
import '@mdi/font/css/materialdesignicons.css';

// Custom themes
const satelliteTheme: ThemeDefinition = {
  dark: true,
  colors: {
    background: '#FFFFFF',
    surface: '#FFFFFF',
    primary: '#6200EE',
    'primary-darken-1': '#3700B3',
    secondary: '#03DAC6',
    'secondary-darken-1': '#018786',
    error: '#B00020',
    info: '#2196F3',
    success: '#4CAF50',
    warning: '#FB8C00',
  },
};

export default createVuetify({
  // Global configuration
  // https://next.vuetifyjs.com/en/features/global-configuration/
  /*
  defaults: {
    global: {
      ripple: false,
    },
    VSheet: {
      elevation: 4,
    },
  },
  */
  // Icon Fonts
  // https://next.vuetifyjs.com/en/features/icon-fonts/
  icons: {
    defaultSet: 'mdi',
    aliases,
    sets: {
      mdi,
    },
  },
  // Internationalization (i18n)
  // https://next.vuetifyjs.com/en/features/internationalization/#internationalization-i18n
  locale: {
    locale: 'en',
    fallback: 'en',
    messages: { en },
  },
  // Theme
  // https://next.vuetifyjs.com/en/features/theme/
  theme: {
    defaultTheme: 'light',
    themes: {
      satelliteTheme,
    },
  },
});

// Export for test.
export { components, directives };
