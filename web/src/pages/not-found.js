import { el } from '../utils/dom.js';

export function renderNotFound() {
  return el('div', { class: 'stack', role: 'alert' }, [
    el('h1', {}, 'Página no encontrada'),
    el('p', {}, 'La ruta solicitada no existe en la Central de Inteligencia Productiva.'),
    el('a', { class: 'button', href: '/', 'data-nav-link': 'inicio' }, 'Volver a Inicio'),
  ]);
}
