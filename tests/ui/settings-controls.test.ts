import { parseHTML } from 'linkedom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDefaultSettings, type Settings } from '../../src/domain/settings/settings';
import { mountSettingsControls } from '../../src/ui/components/settings-controls';

afterEach(() => {
  vi.unstubAllGlobals();
});

function createPage() {
  const { document } = parseHTML(
    '<html><body><div id="features"></div><p id="status"></p></body></html>',
  );
  vi.stubGlobal('document', document);
  const container = document.getElementById('features');
  const status = document.getElementById('status');
  if (!container || !status) throw new Error('Invalid test page.');
  return { container, status };
}

describe('feature settings controls', () => {
  it('keeps unsupported settings locked and does not overwrite storage', async () => {
    const { container, status } = createPage();
    const failure = new Error('Unknown storage version');
    failure.name = 'UnsupportedSchemaVersionError';
    const repository = { get: vi.fn().mockRejectedValue(failure), set: vi.fn() };
    const controls = mountSettingsControls(container, repository, status);

    expect([...container.querySelectorAll('input')].every((input) => input.disabled)).toBe(true);
    await expect(controls.load()).rejects.toBe(failure);
    expect([...container.querySelectorAll('input')].every((input) => input.disabled)).toBe(true);
    expect(repository.set).not.toHaveBeenCalled();
    expect(status.textContent).toContain('newer extension version');
  });

  it('preserves unrelated edits and serializes queued writes', async () => {
    const { container, status } = createPage();
    let persisted: Settings = createDefaultSettings();
    const repository = {
      get: vi.fn(() => Promise.resolve(persisted)),
      set: vi.fn((settings: Settings) => {
        persisted = settings;
        return Promise.resolve();
      }),
    };
    const controls = mountSettingsControls(container, repository, status);
    await controls.load();
    persisted = { ...persisted, historyRetentionDays: 90 };

    await Promise.all([
      controls.save({ resumePlaybackEnabled: true }),
      controls.save({ historyEnabled: true }),
    ]);

    expect(persisted).toEqual({
      ...createDefaultSettings(),
      resumePlaybackEnabled: true,
      historyEnabled: true,
      historyRetentionDays: 90,
    });
    expect([...container.querySelectorAll('input')].every((input) => !input.disabled)).toBe(true);
  });

  it('restores confirmed switch values after a failed write', async () => {
    const { container, status } = createPage();
    const repository = {
      get: vi.fn().mockResolvedValue(createDefaultSettings()),
      set: vi.fn().mockRejectedValue(new Error('Storage unavailable')),
    };
    const controls = mountSettingsControls(container, repository, status);
    await controls.load();
    const history = container.querySelector<HTMLInputElement>('#watch-history');
    if (!history) throw new Error('History switch missing.');
    history.checked = true;

    await expect(controls.save({ historyEnabled: true })).rejects.toThrow('Storage unavailable');

    expect(history.checked).toBe(false);
    expect(history.disabled).toBe(false);
    expect(status.classList.contains('is-error')).toBe(true);
  });
});
