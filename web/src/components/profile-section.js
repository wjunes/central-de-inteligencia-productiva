// ProfileSection: envoltorio semantico comun a cada seccion de Perfil
// Productivo (titulo + descripcion opcional + zona de estado de guardado +
// contenido). Reutilizable, sin logica de negocio propia.
import { el } from '../utils/dom.js';

export function renderProfileSection({ title, description = null, statusSlot = null, content }) {
  const children = [el('h2', {}, title)];
  if (description) children.push(el('p', { class: 'text-secondary' }, description));
  if (statusSlot) children.push(statusSlot);
  children.push(content);
  return el('section', { class: 'profile-section stack' }, children);
}
