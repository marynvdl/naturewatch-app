/**
 * Vue3 Main script
 */

// Load vue core
import { createApp } from 'vue';
import router from './router';
import store from './store';

// Load Vuetify
import vuetify from './plugins/vuetify';

// Load Layout vue.
import App from './App.vue';

// Import Posthog
import posthogPlugin from './plugins/posthog';

/** Register Vue */
const vue = createApp(App);
vue.use(router);
vue.use(store);
vue.use(vuetify);
vue.use(posthogPlugin);

// Run!
router.isReady().then(() => {
  vue.mount('#app');
});
