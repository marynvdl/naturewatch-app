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

// Load Font Awesome
import { library } from "@fortawesome/fontawesome-svg-core";
import { faPhone } from "@fortawesome/free-solid-svg-icons";

library.add(faPhone);

import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";

/** Register Vue */
const vue = createApp(App);
vue.use(router);
vue.use(store);
vue.use(vuetify);

// Run!
router.isReady().then(() => {
  vue.component("font-awesome-icon", FontAwesomeIcon).mount('#app');
});
