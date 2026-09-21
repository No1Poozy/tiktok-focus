import type { SettingsRepository } from '../../application/ports/settings-repository';
import type { WatchSession } from '../../domain/playback/playback-state';
import { mountSettingsControls } from '../components/settings-controls';
import { bindNavigation } from './navigation';

export interface PopupActions {
  openHistory: () => Promise<void>;
  openSettings: () => Promise<void>;
  getStatus: () => Promise<{ version: string }>;
  getLastSession: () => Promise<WatchSession | null>;
}

export function initializePopup(repository: SettingsRepository, actions: PopupActions): void {
  const features = document.getElementById('features');
  const history = document.getElementById('open-history');
  const settings = document.getElementById('open-settings');
  const navigationStatus = document.getElementById('navigation-status');
  const extensionStatus = document.getElementById('extension-status');
  const settingsStatus = document.getElementById('settings-status');
  const resume = document.getElementById('resume-session');

  if (
    !features ||
    !(history instanceof HTMLButtonElement) ||
    !(settings instanceof HTMLButtonElement) ||
    !navigationStatus ||
    !extensionStatus ||
    !settingsStatus ||
    !(resume instanceof HTMLAnchorElement)
  ) {
    throw new Error('Popup is missing required page elements.');
  }

  const controls = mountSettingsControls(features, repository, settingsStatus);
  void controls.load().catch(() => undefined);

  bindNavigation(history, actions.openHistory, navigationStatus);
  bindNavigation(settings, actions.openSettings, navigationStatus);

  void actions.getLastSession().then(
    (session) => {
      if (!session) return;
      resume.href = session.canonicalUrl;
      resume.hidden = false;
    },
    () => {
      // Keep the optional link hidden when the saved session is unavailable.
    },
  );

  void actions.getStatus().then(
    ({ version }) => {
      extensionStatus.textContent = `Version ${version} · Extension ready`;
    },
    () => {
      extensionStatus.textContent = 'Connection unavailable. Reopen the popup to retry.';
      extensionStatus.classList.add('is-error');
    },
  );
}
