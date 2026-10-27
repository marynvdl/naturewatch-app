/**
 * Vue3 Main script
 */

// Load vue core
import { createApp } from 'vue';
import router from './router';
import store from './store';

// Visual system.
import './styles/visual.css';

// Load Layout vue.
import App from './App.vue';

// Import Posthog
import posthogPlugin from './plugins/posthog';

/**
 * Dev-only look at the new controls. The map is unchanged without `?style`.
 */
const showStyleGallery =
  import.meta.env.DEV &&
  new URLSearchParams(window.location.search).has('style');

if (showStyleGallery) {
  void import('./styles/StyleGallery.vue').then(({ default: StyleGallery }) => {
    createApp(StyleGallery).mount('#app');
  });
} else {
  /** Register Vue */
  const vue = createApp(App);
  vue.use(router);
  vue.use(store);
  vue.use(posthogPlugin);

  // Run!
  router.isReady().then(() => {
    vue.mount('#app');
  });
}
