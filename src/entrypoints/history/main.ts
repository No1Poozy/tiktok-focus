import {
  clearHistory,
  createExtensionStorage,
  listHistory,
  openOptionsPage,
  removeHistory,
} from '../../infrastructure/chrome/extension-api';
import { createSettingsRepository } from '../../infrastructure/storage/settings-repository';
import { initializeHistory } from '../../ui/pages/history';
import './style.css';

initializeHistory(createSettingsRepository(createExtensionStorage()), {
  openSettings: openOptionsPage,
  listHistory,
  removeHistory,
  clearHistory,
  confirm: (message) => window.confirm(message),
});
