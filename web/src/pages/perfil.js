// Perfil Productivo (Paso 2B). El frontend NUNCA decide qué actividades,
// productos, insumos o mercados son válidos (prompt seccion 3) - solo
// solicita, presenta, permite seleccionar, envía y muestra errores. Toda
// autoridad de catálogo/validación sigue en backend/knowledge, consumida
// exclusivamente vía GET /profile/catalogs y GET /profile/ramifications/:id.
import { el } from '../utils/dom.js';
import { renderStatusMessage } from '../components/status-message.js';
import { renderProfileSection } from '../components/profile-section.js';
import { renderSaveStatus, updateSaveStatus } from '../components/save-status.js';
import { renderActivitySelector } from '../components/activity-selector.js';
import { renderMultiSelect } from '../components/multi-select.js';
import { renderRamificationSelector } from '../components/ramification-selector.js';
import { renderPrioritySelector } from '../components/priority-selector.js';
import { renderConstraintEditor } from '../components/constraint-editor.js';
import * as api from '../services/api.js';
import { loadActiveProfileId, saveActiveProfileId } from '../state/active-profile.js';
import {
  buildActivityOptions,
  sanitizeSecondaryActivities,
  toggleRamificationSelection,
  selectedRamificationIds,
  addPriority,
  removePriority,
  movePriority,
  addConstraint,
  removeConstraintAt,
  humanizeSlug,
  describeApiError,
} from '../utils/profile-form.js';

function mainActivityId(profile) {
  return profile.activities.find((a) => a.kind === 'main')?.activity_id ?? null;
}
function secondaryActivityIds(profile) {
  return profile.activities.filter((a) => a.kind === 'secondary').map((a) => a.activity_id);
}

export function renderPerfil() {
  const root = el('div', { class: 'stack' }, [el('h1', {}, 'Perfil Productivo')]);
  const body = el('div', { class: 'stack' });
  root.append(body);

  const state = {
    catalogs: null,
    profile: null,
    ramificationsCache: new Map(),
    viewingActivityId: null,
  };

  // --- carga de ramificaciones (con cache en memoria de la sesión - prompt
  // seccion 12: evitar solicitudes redundantes, sin infraestructura de cache
  // compleja) ---
  async function loadRamifications(activityId) {
    if (state.ramificationsCache.has(activityId)) return state.ramificationsCache.get(activityId);
    const data = await api.getActivityRamifications(activityId);
    state.ramificationsCache.set(activityId, data);
    return data;
  }

  // ======================================================================
  // Identificación (A)
  // ======================================================================
  function renderIdentification() {
    const status = renderSaveStatus();
    const nameInput = el('input', { type: 'text', id: 'perfil-nombre', value: state.profile.name ?? '', required: true });
    const roleInput = el('input', { type: 'text', id: 'perfil-rol', value: state.profile.role ?? '' });
    const locationInput = el('input', { type: 'text', id: 'perfil-ubicacion', value: state.profile.location ?? '' });

    const form = el('form', {
      class: 'stack',
      onSubmit: async (event) => {
        event.preventDefault();
        if (!nameInput.value.trim()) return;
        updateSaveStatus(status, 'saving');
        try {
          const updated = await api.updateProfile(state.profile.id, {
            name: nameInput.value.trim(),
            role: roleInput.value.trim() || null,
            location: locationInput.value.trim() || null,
          });
          state.profile = { ...state.profile, ...updated };
          updateSaveStatus(status, 'saved');
        } catch (err) {
          console.error(err);
          updateSaveStatus(status, 'error', describeApiError(err));
        }
      },
    }, [
      el('div', { class: 'field' }, [el('label', { for: 'perfil-nombre' }, 'Nombre del perfil'), nameInput]),
      el('div', { class: 'field' }, [el('label', { for: 'perfil-rol' }, 'Rol (opcional)'), roleInput]),
      el('div', { class: 'field' }, [el('label', { for: 'perfil-ubicacion' }, 'Ubicación (opcional)'), locationInput]),
      el('button', { type: 'submit', class: 'button' }, 'Guardar cambios'),
    ]);

    return renderProfileSection({
      title: 'Identificación',
      description: `Estado: ${state.profile.status ?? 'activo'} · creado ${new Date(state.profile.created_at).toLocaleDateString('es-UY')}`,
      statusSlot: status,
      content: form,
    });
  }

  // ======================================================================
  // Actividades: principal (B) + secundarias (6), un único guardado
  // combinado porque PUT /profiles/:id/activities reemplaza el conjunto
  // completo en una sola llamada (backend/core/profile/store.js#setActivities).
  // ======================================================================
  function renderActivities() {
    const status = renderSaveStatus();
    const currentMain = mainActivityId(state.profile);
    const currentSecondary = secondaryActivityIds(state.profile);

    async function saveActivities(nextMain, nextSecondary) {
      updateSaveStatus(status, 'saving');
      try {
        const updated = await api.updateProfileActivities(state.profile.id, {
          main_activity_id: nextMain,
          secondary_activity_ids: sanitizeSecondaryActivities(nextMain, nextSecondary),
        });
        state.profile.activities = updated.activities;
        state.profile.main_activity_id = updated.main_activity_id;
        updateSaveStatus(status, 'saved');
        refreshActivities();
        refreshProducts(); // la actividad principal/secundarias determina que ramificaciones hay disponibles
      } catch (err) {
        console.error(err);
        updateSaveStatus(status, 'error', describeApiError(err));
      }
    }

    const mainSelector = renderActivitySelector({
      catalog: state.catalogs,
      selectedId: currentMain,
      excludeIds: currentSecondary,
      onChange: (newMainId) => saveActivities(newMainId, currentSecondary),
    });

    const secondaryOptions = buildActivityOptions(state.catalogs, currentMain);
    const secondarySelector = renderMultiSelect({
      label: 'Actividades secundarias',
      options: secondaryOptions,
      selectedIds: currentSecondary,
      onChange: (newSecondaryIds) => saveActivities(currentMain, newSecondaryIds),
      emptyText: currentMain ? 'No hay otras actividades disponibles para agregar.' : 'Definí primero una actividad principal.',
    });

    const content = el('div', { class: 'stack' }, [
      el('div', { class: 'stack' }, [el('h3', {}, 'Actividad principal'), mainSelector]),
      el('div', { class: 'stack' }, [el('h3', {}, 'Actividades secundarias'), secondarySelector]),
    ]);

    return renderProfileSection({
      title: 'Actividades',
      description: 'La actividad principal es el centro de gravedad del perfil, pero no implica automáticamente máxima relevancia.',
      statusSlot: status,
      content,
    });
  }

  // ======================================================================
  // Productos e insumos (7)
  // ======================================================================
  function renderProducts() {
    const status = renderSaveStatus();
    const candidateIds = [mainActivityId(state.profile), ...secondaryActivityIds(state.profile)].filter(Boolean);
    const content = el('div', { class: 'stack' });

    if (candidateIds.length === 0) {
      content.append(el('p', { class: 'text-secondary' }, 'Definí al menos una actividad para ver sus productos e insumos.'));
      return renderProfileSection({ title: 'Productos e insumos', statusSlot: status, content });
    }

    if (!state.viewingActivityId || !candidateIds.includes(state.viewingActivityId)) {
      state.viewingActivityId = candidateIds[0];
    }

    const itemById = new Map(state.catalogs.activities.items.map((i) => [i.id, i]));
    const switcher = el('div', { class: 'activity-switcher', role: 'group', 'aria-label': 'Actividad a mostrar' });
    for (const activityId of candidateIds) {
      switcher.append(
        el('button', {
          type: 'button',
          class: 'button--tab',
          'aria-pressed': String(activityId === state.viewingActivityId),
          onClick: () => { state.viewingActivityId = activityId; refreshProducts(); },
        }, itemById.get(activityId)?.name ?? activityId)
      );
    }
    content.append(switcher);

    const slot = el('div', {}, [renderStatusMessage({ kind: 'loading', title: 'Cargando ramificaciones…' })]);
    content.append(slot);

    const activityId = state.viewingActivityId;
    loadRamifications(activityId)
      .then((data) => {
        if (state.viewingActivityId !== activityId) return; // el usuario ya cambió de actividad
        async function toggle(kind, ramificationId, checked) {
          const list = kind === 'products' ? state.profile.products : state.profile.inputs;
          const next = toggleRamificationSelection(list, activityId, ramificationId, checked);
          updateSaveStatus(status, 'saving');
          try {
            const updated = kind === 'products' ? await api.updateProfileProducts(state.profile.id, next) : await api.updateProfileInputs(state.profile.id, next);
            if (kind === 'products') state.profile.products = updated.products;
            else state.profile.inputs = updated.inputs;
            updateSaveStatus(status, 'saved');
            refreshProducts();
          } catch (err) {
            console.error(err);
            updateSaveStatus(status, 'error', describeApiError(err));
          }
        }

        slot.replaceChildren(
          renderRamificationSelector({
            ramifications: data.ramifications,
            selectedProductIds: selectedRamificationIds(state.profile.products, activityId),
            selectedInputIds: selectedRamificationIds(state.profile.inputs, activityId),
            onToggleProduct: (id, checked) => toggle('products', id, checked),
            onToggleInput: (id, checked) => toggle('inputs', id, checked),
          })
        );
      })
      .catch((err) => {
        console.error(err);
        if (state.viewingActivityId !== activityId) return;
        slot.replaceChildren(renderStatusMessage({ kind: 'error', title: 'No se pudieron cargar las ramificaciones', text: describeApiError(err) }));
      });

    return renderProfileSection({
      title: 'Productos e insumos',
      description: 'Según la actividad elegida, a partir del conocimiento real de ramificaciones (no un listado genérico).',
      statusSlot: status,
      content,
    });
  }

  // ======================================================================
  // Mercados (8)
  // ======================================================================
  function renderMarkets() {
    const status = renderSaveStatus();
    const options = state.catalogs.markets.market_dimensions.map((id) => ({ id, label: humanizeSlug(id) }));
    const content = renderMultiSelect({
      label: 'Mercados',
      options,
      selectedIds: state.profile.markets,
      onChange: async (nextIds) => {
        updateSaveStatus(status, 'saving');
        try {
          const updated = await api.updateProfileMarkets(state.profile.id, nextIds);
          state.profile.markets = updated.markets;
          updateSaveStatus(status, 'saved');
          refreshMarkets();
        } catch (err) {
          console.error(err);
          updateSaveStatus(status, 'error', describeApiError(err));
        }
      },
    });
    return renderProfileSection({ title: 'Mercados', description: 'Dimensiones de mercado del catálogo oficial - no actividades productivas.', statusSlot: status, content });
  }

  // ======================================================================
  // Prioridades (9)
  // ======================================================================
  function renderPriorities() {
    const status = renderSaveStatus();

    async function save(next) {
      updateSaveStatus(status, 'saving');
      try {
        const updated = await api.updateProfilePriorities(state.profile.id, next);
        state.profile.priorities = updated.priorities;
        updateSaveStatus(status, 'saved');
        refreshPriorities();
      } catch (err) {
        console.error(err);
        updateSaveStatus(status, 'error', describeApiError(err));
      }
    }

    const content = renderPrioritySelector({
      topics: state.catalogs.topics,
      selected: state.profile.priorities,
      onChange: (action) => {
        if (typeof action === 'string') return save(addPriority(state.profile.priorities, action));
        if (action.remove) return save(removePriority(state.profile.priorities, action.remove));
        if (action.move != null) return save(movePriority(state.profile.priorities, action.move, action.direction));
      },
    });

    return renderProfileSection({
      title: 'Prioridades',
      description: 'Ordenan preferencias; no aumentan la relevancia central por sí mismas.',
      statusSlot: status,
      content,
    });
  }

  // ======================================================================
  // Restricciones (10)
  // ======================================================================
  function renderConstraints() {
    const status = renderSaveStatus();

    async function save(next) {
      updateSaveStatus(status, 'saving');
      try {
        const updated = await api.updateProfileConstraints(state.profile.id, next);
        state.profile.constraints = updated.constraints;
        updateSaveStatus(status, 'saved');
        refreshConstraints();
      } catch (err) {
        console.error(err);
        updateSaveStatus(status, 'error', describeApiError(err));
      }
    }

    const content = renderConstraintEditor({
      categories: state.catalogs.constraints.categories,
      severities: state.catalogs.constraints.severities,
      selected: state.profile.constraints,
      onAdd: (constraint) => save(addConstraint(state.profile.constraints, constraint)),
      onRemove: (index) => save(removeConstraintAt(state.profile.constraints, index)),
    });

    return renderProfileSection({
      title: 'Restricciones',
      description: 'Nunca se convierten en recomendaciones - solo se declaran.',
      statusSlot: status,
      content,
    });
  }

  // --- anclas estables por sección: cada refresh reemplaza solo su propio
  // contenedor, sin re-renderizar toda la página (preserva el resto del
  // formulario y la posición de scroll) ---
  const identificationContainer = el('div');
  const activitiesContainer = el('div');
  const productsContainer = el('div');
  const marketsContainer = el('div');
  const prioritiesContainer = el('div');
  const constraintsContainer = el('div');

  function refreshIdentification() { identificationContainer.replaceChildren(renderIdentification()); }
  function refreshActivities() { activitiesContainer.replaceChildren(renderActivities()); }
  function refreshProducts() { productsContainer.replaceChildren(renderProducts()); }
  function refreshMarkets() { marketsContainer.replaceChildren(renderMarkets()); }
  function refreshPriorities() { prioritiesContainer.replaceChildren(renderPriorities()); }
  function refreshConstraints() { constraintsContainer.replaceChildren(renderConstraints()); }

  function renderCreateForm() {
    const status = renderSaveStatus();
    const nameInput = el('input', { type: 'text', id: 'perfil-nuevo-nombre', required: true, placeholder: 'p. ej. Establecimiento Los Ceibos' });
    const form = el('form', {
      class: 'stack',
      onSubmit: async (event) => {
        event.preventDefault();
        if (!nameInput.value.trim()) return;
        updateSaveStatus(status, 'saving');
        try {
          const created = await api.createProfile({ name: nameInput.value.trim() });
          saveActiveProfileId(created.id);
          state.profile = created;
          mountSections();
        } catch (err) {
          console.error(err);
          updateSaveStatus(status, 'error', describeApiError(err));
        }
      },
    }, [
      el('div', { class: 'field' }, [el('label', { for: 'perfil-nuevo-nombre' }, 'Nombre del perfil'), nameInput]),
      el('button', { type: 'submit', class: 'button' }, 'Crear perfil'),
      status,
    ]);

    return el('div', { class: 'stack' }, [
      el('p', {}, 'Todavía no configuraste un perfil productivo en este dispositivo. Creá uno para empezar.'),
      form,
    ]);
  }

  function mountSections() {
    body.replaceChildren(
      identificationContainer,
      activitiesContainer,
      productsContainer,
      marketsContainer,
      prioritiesContainer,
      constraintsContainer
    );
    refreshIdentification();
    refreshActivities();
    refreshProducts();
    refreshMarkets();
    refreshPriorities();
    refreshConstraints();
  }

  async function boot() {
    body.replaceChildren(renderStatusMessage({ kind: 'loading', title: 'Cargando catálogo…' }));
    try {
      state.catalogs = await api.getProfileCatalogs();
    } catch (err) {
      console.error(err);
      body.replaceChildren(renderStatusMessage({ kind: 'error', title: 'No se pudo cargar el catálogo de Perfil Productivo', text: describeApiError(err) }));
      return;
    }

    const activeId = loadActiveProfileId();
    if (activeId) {
      try {
        state.profile = await api.getProfile(activeId);
      } catch (err) {
        console.error(err);
        state.profile = null; // perfil inexistente/borrado -> vuelve a modo creación, sin romper la pantalla
      }
    }

    if (state.profile) mountSections();
    else body.replaceChildren(renderCreateForm());
  }

  boot();
  return root;
}
