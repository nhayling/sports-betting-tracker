/** Light, dark, or whatever the device is set to. Remembered per device. */
export type ThemeChoice = 'light' | 'dark' | 'system';

/** Also read by the inline script in index.html, which sets the theme before first paint. */
const KEY = 'sports-better:theme';
const deviceLight = matchMedia('(prefers-color-scheme: light)');

export function readTheme(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

function apply(choice: ThemeChoice) {
  const light = choice === 'light' || (choice === 'system' && deviceLight.matches);
  document.documentElement.dataset.theme = light ? 'light' : 'dark';
}

export function setTheme(choice: ThemeChoice) {
  try {
    if (choice === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    // Not remembered; it still applies until the page reloads.
  }
  apply(choice);
}

// Following the device: switch when it does (sunset, Control Centre).
deviceLight.addEventListener('change', () => readTheme() === 'system' && apply('system'));
