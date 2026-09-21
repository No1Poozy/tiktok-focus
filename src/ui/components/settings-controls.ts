import type { SettingsRepository } from '../../application/ports/settings-repository';
import type { Settings } from '../../domain/settings/settings';
import { createToggle } from './toggle';

type FeatureKey = 'resumePlaybackEnabled' | 'historyEnabled';

const FEATURES: readonly {
  key: FeatureKey;
  id: string;
  label: string;
  description: string;
}[] = [
  {
    key: 'resumePlaybackEnabled',
    id: 'resume-playback',
    label: 'Resume Playback',
    description: 'Continue saved videos; requires Watch History',
  },
  {
    key: 'historyEnabled',
    id: 'watch-history',
    label: 'Watch History',
    description: 'Save watched videos on this device',
  },
];

/** Serialize this page's edits, reading the latest preferences before each write. */
export function mountSettingsControls(
  container: HTMLElement,
  repository: SettingsRepository,
  status: HTMLElement,
): {
  load: () => Promise<Settings>;
  save: (changes: Partial<Settings>, successMessage?: string) => Promise<void>;
} {
  const inputs = new Map<FeatureKey, HTMLInputElement>();
  let loaded = false;
  let pendingWrites = 0;
  let pending: Promise<void> = Promise.resolve();
  let confirmed: Settings | undefined;

  function setDisabled(): void {
    for (const input of inputs.values()) input.disabled = !loaded || pendingWrites > 0;
  }

  function showSettings(settings: Settings): void {
    for (const [key, input] of inputs) input.checked = settings[key];
  }

  function save(
    changes: Partial<Settings>,
    successMessage = 'Saved on this device.',
  ): Promise<void> {
    if (!loaded) return Promise.reject(new Error('Settings have not loaded.'));
    pendingWrites += 1;
    setDisabled();
    status.classList.remove('is-error');
    status.textContent = 'Saving...';

    const operation = pending
      .catch(() => undefined)
      .then(async () => {
        const latest = await repository.get();
        const next = { ...latest, ...changes };
        await repository.set(next);
        confirmed = next;
        showSettings(next);
        status.classList.remove('is-error');
        status.textContent = successMessage;
      });
    pending = operation;

    return operation
      .catch((error: unknown) => {
        if (confirmed) showSettings(confirmed);
        status.textContent = settingsErrorMessage(error, 'save');
        status.classList.add('is-error');
        throw error;
      })
      .finally(() => {
        pendingWrites -= 1;
        setDisabled();
      });
  }

  container.replaceChildren(
    ...FEATURES.map((feature) => {
      const toggle = createToggle({ ...feature, disabled: true });
      const input = toggle.querySelector('input');
      if (!input) throw new Error('Feature toggle is missing its checkbox.');
      inputs.set(feature.key, input);
      input.addEventListener('change', () => {
        void save({ [feature.key]: input.checked }).catch(() => undefined);
      });
      return toggle;
    }),
  );

  return {
    async load() {
      try {
        confirmed = await repository.get();
        loaded = true;
        showSettings(confirmed);
        setDisabled();
        status.textContent = 'Changes are saved on this device.';
        return confirmed;
      } catch (error: unknown) {
        status.textContent = settingsErrorMessage(error, 'load');
        status.classList.add('is-error');
        throw error;
      }
    },
    save,
  };
}

function settingsErrorMessage(error: unknown, action: 'load' | 'save'): string {
  if (error instanceof Error && error.name === 'UnsupportedSchemaVersionError') {
    return 'These settings need a newer extension version. Your saved data has been kept.';
  }
  return action === 'load'
    ? 'Could not load settings. Reopen this page to try again.'
    : 'Could not save settings. Please try again.';
}
