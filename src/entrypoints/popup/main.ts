import {
  createExtensionStorage,
  getExtensionStatus,
  getLastSession,
  openHistoryPage,
  openOptionsPage,
} from '../../infrastructure/chrome/extension-api';
import { createSettingsRepository } from '../../infrastructure/storage/settings-repository';
import { initializePopup } from '../../ui/pages/popup';
import './style.css';

initializePopup(createSettingsRepository(createExtensionStorage()), {
  openHistory: openHistoryPage,
  openSettings: openOptionsPage,
  getStatus: getExtensionStatus,
  getLastSession,
});
