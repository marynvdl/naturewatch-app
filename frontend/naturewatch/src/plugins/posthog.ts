/* eslint-disable import/no-named-as-default */
import PostHog from 'posthog-js';
/* eslint-enable import/no-named-as-default */
import type { App } from 'vue';


// Initialize PostHog and export the instance
const token = import.meta.env.VITE_APP_POSTHOG_TOKEN;

let posthogInstance: any;

const allowedHostnames = ['test.naturewatch.space', 'naturewatch.space'];
if (allowedHostnames.includes(window.location.hostname)) {
  posthogInstance = PostHog.init(token || 'default-token', {
    api_host: 'https://app.posthog.com',
  }) as typeof PostHog;
  
}

// Export a function to get the PostHog instance
export function usePosthog() {
  return posthogInstance;
}

// Export the plugin
export default {
  install: (app: App): void => {
    app.config.globalProperties.$posthog = posthogInstance;
  },
};
