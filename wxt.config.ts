import { defineConfig } from 'wxt';
import { APP_NAME } from './src/shared/constants';

export default defineConfig({
  srcDir: 'src',
  manifestVersion: 3,
  imports: false,
  hooks: {
    'entrypoints:found': (_wxt, entrypoints) => {
      // WXT reserves "history" for chrome://history overrides. Ours is a normal page.
      const history = entrypoints.find((entrypoint) => entrypoint.name === 'history');
      if (history) history.type = 'unlisted-page';
    },
  },
  manifest: {
    name: APP_NAME,
    description: 'Browser fullscreen, local TikTok watch history, and playback resume.',
    permissions: ['storage'],
  },
});
