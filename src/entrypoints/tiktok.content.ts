import { defineContentScript } from 'wxt/utils/define-content-script';

import { createTikTokAdapter } from '../tiktok/adapter';
import { startTikTokController } from '../tiktok/controller';
import {
  createExtensionStorage,
  getResumePosition,
  observeSettingsChanges,
  recordProgress,
} from '../infrastructure/chrome/extension-api';
import { createSettingsRepository } from '../infrastructure/storage/settings-repository';

export default defineContentScript({
  matches: ['https://www.tiktok.com/*'],
  runAt: 'document_idle',
  noScriptStartedPostMessage: true,
  main(ctx) {
    const adapter = createTikTokAdapter();
    const settings = createSettingsRepository(createExtensionStorage());
    const stop = startTikTokController(adapter, {
      getSettings: () => settings.get(),
      observeSettings: observeSettingsChanges,
      recordProgress,
      getResumePosition,
    });
    ctx.onInvalidated(stop);

    if (import.meta.env.DEV) {
      console.debug('[TikTok Focus] TikTok integration initialized.');
    }
  },
});
