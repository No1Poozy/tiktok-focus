export interface ToggleOptions {
  id: string;
  label: string;
  description: string;
  checked?: boolean;
  disabled?: boolean;
}

/** A native checkbox keeps the switch keyboard and assistive-technology accessible. */
export function createToggle(options: ToggleOptions): HTMLLabelElement {
  const label = document.createElement('label');
  label.className = 'toggle';
  label.htmlFor = options.id;

  const copy = document.createElement('span');
  copy.className = 'toggle-copy';

  const title = document.createElement('span');
  title.className = 'toggle-label';
  title.textContent = options.label;

  const description = document.createElement('span');
  description.id = `${options.id}-description`;
  description.className = 'toggle-description';
  description.textContent = options.description;

  const input = document.createElement('input');
  input.id = options.id;
  input.className = 'toggle-input';
  input.type = 'checkbox';
  input.role = 'switch';
  input.checked = options.checked ?? false;
  input.disabled = options.disabled ?? false;
  input.setAttribute('aria-describedby', description.id);

  copy.append(title, description);
  label.append(copy, input);
  return label;
}
