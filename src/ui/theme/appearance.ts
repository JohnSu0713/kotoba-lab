export type Appearance = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'kotoba-lab:appearance';
const media = window.matchMedia('(prefers-color-scheme: dark)');

function isAppearance(value: string | null): value is Appearance {
  return value === 'system' || value === 'light' || value === 'dark';
}

export class AppearanceController {
  private preference: Appearance;

  constructor() {
    const stored = localStorage.getItem(STORAGE_KEY);
    this.preference = isAppearance(stored) ? stored : 'system';
    media.addEventListener('change', () => {
      if (this.preference === 'system') this.apply();
    });
    this.apply();
  }

  get(): Appearance { return this.preference; }
  set(value: Appearance): void { this.preference = value; localStorage.setItem(STORAGE_KEY, value); this.apply(); }
  resolved(): 'light' | 'dark' { return this.preference === 'system' ? (media.matches ? 'dark' : 'light') : this.preference; }
  toggleResolved(): void { this.set(this.resolved() === 'dark' ? 'light' : 'dark'); }

  private apply(): void {
    const resolved = this.resolved();
    document.documentElement.dataset.theme = resolved;
    document.documentElement.dataset.appearance = this.preference;
    document.documentElement.style.colorScheme = resolved;
    const themeColor = resolved === 'dark' ? '#101411' : '#f4f1e9';
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content', themeColor);
    document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-status-bar-style"]')?.setAttribute('content', resolved === 'dark' ? 'black-translucent' : 'default');
  }
}

export const appearance = new AppearanceController();
