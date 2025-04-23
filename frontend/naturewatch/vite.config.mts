import { fileURLToPath, URL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type UserConfig } from 'vite';
import { visualizer } from 'rollup-plugin-visualizer';
import { checker } from 'vite-plugin-checker';
import vue from '@vitejs/plugin-vue';
import vuetify, { transformAssetUrls } from 'vite-plugin-vuetify';

export default defineConfig(async ({ command, mode }): Promise<UserConfig> => {
  const config: UserConfig = {
    base: './',
    define: { 'process.env': {} },
    plugins: [
      vue({
        template: {
          transformAssetUrls,
        },
      }),
      vuetify({
        autoImport: true,
        styles: { configFile: 'src/styles/settings.scss' },
      }),
      checker({
        typescript: true,
        vueTsc: true,
        eslint: {
          lintCommand:
            'eslint . --cache --cache-location ./node_modules/.vite/vite-plugin-eslint',
        },
      }),
    ],
    server: {
      fs: {
        allow: ['..'],
      },
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        '~': fileURLToPath(new URL('./node_modules', import.meta.url)),
      },
      extensions: ['.js', '.json', '.jsx', '.mjs', '.ts', '.tsx', '.vue'],
    },
    build: {
      target: 'esnext',
      minify: 'esbuild',
      rollupOptions: {
        output: {
          manualChunks: {
            vue: ['vue', 'vue-router', 'pinia', 'pinia-plugin-persistedstate'],
            vuetify: [
              'vuetify',
              'vuetify/components',
              'vuetify/directives',
              'webfontloader',
            ],
            materialdesignicons: ['@mdi/font/css/materialdesignicons.css'],
          },
          plugins: [
            mode === 'analyze'
              ? visualizer({
                  open: true,
                  filename: 'dist/stats.html',
                })
              : undefined,
          ].filter(Boolean),
        },
      },
    },
    esbuild: {
      drop: command === 'serve' ? [] : ['console'],
    },
  };

  // Read and parse package.json
  const packageJsonPath = path.resolve('./package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

  // Generate Meta.ts file with build info
  fs.writeFileSync(
    fileURLToPath(new URL('./src/Meta.ts', import.meta.url)),
    `import type MetaInterface from '@/interfaces/MetaInterface';
const meta: MetaInterface = {
  version: '${packageJson.version}',
  date: '${new Date().toISOString()}',
};
export default meta;
`
  );

  return config;
});
