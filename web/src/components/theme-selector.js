// Selector de tema: 3 <button> reales (prompt seccion 16 - no divs con
// click), con aria-pressed reflejando la preferencia activa. Persiste via
// state/theme.js (localStorage) y aplica el atributo data-theme sin recargar
// la pagina (prompt seccion 12).
import { el } from '../utils/dom.js';
import { loadThemePreference, saveThemePreference, applyThemePreference } from '../state/theme.js';

const OPTIONS = [
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Oscuro' },
  { value: 'system', label: 'Sistema' },
];

export function renderThemeSelector() {
  const current = loadThemePreference();
  const group = el('div', { class: 'theme-selector', role: 'group', 'aria-label': 'Tema de la interfaz' });

  const buttons = OPTIONS.map((opt) =>
    el(
      'button',
      {
        type: 'button',
        class: 'theme-selector__button',
        'aria-pressed': String(opt.value === current),
        onClick: () => {
          const applied = saveThemePreference(opt.value);
          applyThemePreference(applied);
          for (const btn of group.querySelectorAll('.theme-selector__button')) {
            btn.setAttribute('aria-pressed', String(btn.dataset.value === applied));
          }
        },
      },
      opt.label
    )
  );
  buttons.forEach((btn, i) => { btn.dataset.value = OPTIONS[i].value; });
  group.append(...buttons);
  return group;
}
