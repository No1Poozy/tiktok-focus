import { createExtensionStorage, openHistoryPage } from '../../infrastructure/chrome/extension-api';
import { createSettingsRepository } from '../../infrastructure/storage/settings-repository';
import { initializeOptions } from '../../ui/pages/options';
import './style.css';

void initializeOptions(createSettingsRepository(createExtensionStorage()), openHistoryPage);
