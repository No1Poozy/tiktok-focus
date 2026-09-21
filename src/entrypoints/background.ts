import { defineBackground } from 'wxt/utils/define-background';
import { registerBackgroundMessages } from '../infrastructure/chrome/extension-api';
import { createExtensionStorage } from '../infrastructure/chrome/extension-api';
import { createHistoryService } from '../application/history-service';
import { createHistoryRepository } from '../infrastructure/storage/history-repository';
import { createSessionRepository } from '../infrastructure/storage/session-repository';
import { createSettingsRepository } from '../infrastructure/storage/settings-repository';

export default defineBackground(() => {
  const storage = createExtensionStorage();
  registerBackgroundMessages(
    createHistoryService(
      createHistoryRepository(),
      createSettingsRepository(storage),
      createSessionRepository(storage),
    ),
  );
});
