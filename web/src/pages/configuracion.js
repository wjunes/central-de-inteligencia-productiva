import { el } from '../utils/dom.js';
import { renderThemeSelector } from '../components/theme-selector.js';

export function renderConfiguracion() {
  return el('div', { class: 'stack' }, [
    el('h1', {}, 'Configuración'),
    el('section', { class: 'stack' }, [
      el('h2', {}, 'Tema'),
      el('p', { class: 'text-secondary' }, 'La preferencia se guarda en este dispositivo. "Sistema" sigue la configuración del sistema operativo automáticamente.'),
      renderThemeSelector(),
      el('p', { class: 'text-caption' }, 'El ahorro de energía del tema oscuro depende del tipo de pantalla: es notorio en pantallas OLED/AMOLED y puede ser mínimo o nulo en pantallas LCD.'),
    ]),
  ]);
}
