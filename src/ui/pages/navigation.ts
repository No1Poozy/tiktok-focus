/** Keeps navigation failures visible without allowing duplicate clicks while a tab opens. */
export function bindNavigation(
  button: HTMLButtonElement,
  navigate: () => Promise<void>,
  status: HTMLElement,
): void {
  button.addEventListener('click', () => {
    button.disabled = true;
    status.textContent = '';
    status.classList.remove('is-error');

    void navigate()
      .catch(() => {
        status.textContent = 'Could not open the page. Please try again.';
        status.classList.add('is-error');
      })
      .finally(() => {
        button.disabled = false;
      });
  });
}
