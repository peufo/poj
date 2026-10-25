// Choix du thème dans le lab uniquement : l'application, elle, suit le système.

export type ThemePreference = 'system' | 'light' | 'dark';

const KEY = 'poj-lab-theme';

export const theme = $state<{ preference: ThemePreference }>({ preference: 'system' });

export function applyTheme(preference: ThemePreference) {
	theme.preference = preference;
	const root = document.documentElement;
	if (preference === 'system') delete root.dataset.theme;
	else root.dataset.theme = preference;
	try {
		localStorage.setItem(KEY, preference);
	} catch {
		// stockage indisponible (navigation privée) : le choix vaut pour la page
	}
}

export function restoreTheme() {
	try {
		const saved = localStorage.getItem(KEY);
		if (saved === 'light' || saved === 'dark' || saved === 'system') applyTheme(saved);
	} catch {
		// idem
	}
}

export function releaseTheme() {
	delete document.documentElement.dataset.theme;
}
