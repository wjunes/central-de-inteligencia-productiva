// Marca el item de navegacion activo (aria-current="page") - el color nunca
// es el unico indicador (prompt seccion 18): aria-current tambien lo es, y
// components.css lo refuerza con un borde, no solo con el color de texto.
export function setActiveNavItem(routeName, root = typeof document !== 'undefined' ? document : null) {
  if (!root) return;
  for (const link of root.querySelectorAll('[data-nav-link]')) {
    if (link.dataset.navLink === routeName) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
}
