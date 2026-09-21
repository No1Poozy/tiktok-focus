import type { SettingsRepository } from '../../application/ports/settings-repository';
import { mountSettingsControls } from '../components/settings-controls';
import { bindNavigation } from './navigation';

export async function initializeOptions(
  repository: SettingsRepository,
  openHistory: () => Promise<void>,
): Promise<void> {
  const features = document.getElementById('features');
  const form = document.getElementById('settings-form');
  const retention = document.getElementById('history-retention');
  const save = document.getElementById('save-settings');
  const status = document.getElementById('settings-status');
  const history = document.getElementById('open-history');
  const navigationStatus = document.getElementById('navigation-status');
  const featureStatus = document.getElementById('feature-status');

  if (
    !features ||
    !(form instanceof HTMLFormElement) ||
    !(retention instanceof HTMLInputElement) ||
    !(save instanceof HTMLButtonElement) ||
    !status ||
    !(history instanceof HTMLButtonElement) ||
    !navigationStatus ||
    !featureStatus
  ) {
    throw new Error('Settings is missing required page elements.');
  }

  const controls = mountSettingsControls(features, repository, featureStatus);

  bindNavigation(history, openHistory, navigationStatus);

  try {
    const settings = await controls.load();
    retention.value = String(settings.historyRetentionDays);
    retention.disabled = false;
    save.disabled = false;
    status.textContent = 'Preferences are stored locally on this device.';
  } catch {
    status.textContent = 'Could not load settings. Reload this page to try again.';
    status.classList.add('is-error');
    return;
  }

  retention.addEventListener('input', () => {
    status.textContent = 'Changes are not saved.';
    status.classList.remove('is-error');
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (save.disabled || !form.reportValidity()) return;

    const historyRetentionDays = retention.valueAsNumber;
    if (
      !Number.isInteger(historyRetentionDays) ||
      historyRetentionDays < 1 ||
      historyRetentionDays > 365
    ) {
      status.textContent = 'Enter a whole number of days between 1 and 365.';
      status.classList.add('is-error');
      retention.focus();
      return;
    }

    save.disabled = true;
    retention.disabled = true;
    status.classList.remove('is-error');
    status.textContent = 'Saving…';

    void controls
      .save({ historyRetentionDays }, 'Preferences saved on this device.')
      .then(() => {
        status.textContent = 'Preferences saved on this device.';
      })
      .catch(() => {
        status.textContent = 'Could not save preferences. Your changes are still here; try again.';
        status.classList.add('is-error');
      })
      .finally(() => {
        save.disabled = false;
        retention.disabled = false;
      });
  });
}
