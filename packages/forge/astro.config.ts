import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import tutorialkit from '@tutorialkit/astro';
import { defineConfig } from 'astro/config';
import { remarkExternalLinks } from './src/lib/externalLinks.mjs';
import { forgeOwnerProxy } from './src/lib/forgeProxy.mjs';

const appRoot = fileURLToPath(new URL('.', import.meta.url));
const forgeRoot = process.env.FORGE_WORKTREE || resolve(appRoot, '../../../learning-forge');
const forgeUrl = process.env.FORGE_URL || 'http://127.0.0.1:8876';

export default defineConfig({
  devToolbar: { enabled: false },
  // Citation and other outside links open in a new tab, keeping the tutorial open.
  markdown: { remarkPlugins: [remarkExternalLinks] },
  integrations: [tutorialkit({ components: { TopBar: './src/components/TopBar.astro' } })],
  vite: {
    // Native Astro islands discover these after Vite's source scan. Pre-bundle
    // them before the first page hydrates to avoid a mid-load React reload.
    optimizeDeps: {
      include: ['@tutorialkit/astro > @nanostores/react', '@tutorialkit/astro > @stackblitz/sdk'],
    },
    plugins: [forgeOwnerProxy(forgeUrl)],
    define: { __FORGE_URL__: JSON.stringify(forgeUrl) },
    resolve: {
      alias: {
        '@forge': resolve(forgeRoot, 'forge_paths/ui/src'),
        // The same built singleton imported by native WorkspacePanelWrapper.
        '@tutorialkit-layout': resolve(appRoot, '../astro/dist/default/layouts/Layout.astro'),
        '@tutorialkit-webcontainer': resolve(appRoot, '../astro/dist/default/components/webcontainer.js'),
      },
    },
    server: {
      fs: { allow: [resolve(appRoot, '../..'), forgeRoot] },
      proxy: { '/api': { target: forgeUrl, changeOrigin: true } },
    },
  },
});
