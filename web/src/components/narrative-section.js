// narrative-section (Paso 2E-2, arquitectura-informes-ux.md §14): la
// narrativa es un enriquecimiento OPCIONAL, nunca el contenido principal -
// colapsada por defecto (<details>). Modo determinístico por defecto (0
// costo externo); modo IA requiere una confirmación EXPLÍCITA con el texto
// de advertencia exacto sobre envío de datos a un proveedor externo - nunca
// se activa con un solo clic ni automáticamente. Componente "tonto": no
// llama a la API, solo presenta el estado que la página gestiona.
import { el } from '../utils/dom.js';
import { renderStatusMessage } from './status-message.js';

const AI_WARNING = 'Esto envía la información de este informe — incluyendo datos de tu perfil productivo si es un informe personalizado — a un proveedor de inteligencia artificial externo (DeepSeek u OpenRouter). No se activa automáticamente ni se usa para generar el contenido del informe, solo para redactarlo en lenguaje corrido.';

function renderParagraphs(narrative) {
  const paragraphs = narrative.body.paragraphs ?? [];
  if (!paragraphs.length) return el('p', { class: 'text-secondary' }, 'La narrativa no produjo párrafos.');
  return el('div', { class: 'stack' }, paragraphs.map((p) => el('p', {}, p.paragraph)));
}

function renderExisting(narrative) {
  const statusBadge = el('span', { class: `badge${narrative.status === 'validated' ? ' badge--status' : ' badge--risk'}` }, narrative.status === 'validated' ? 'Validada' : 'Rechazada por el validador');
  const children = [statusBadge, renderParagraphs(narrative)];
  if (narrative.status !== 'validated') {
    children.push(renderStatusMessage({ kind: 'warning', title: 'Esta narrativa no pasó la validación automática', text: 'Se conserva de todas formas para inspección - no debe tratarse como texto confiable.' }));
  }
  return el('div', { class: 'stack' }, children);
}

export function renderNarrativeSection({ status, narrative = null, error = null, aiConfirmOpen = false, onLoad, onGenerateDeterministic, onRequestAiConfirm, onConfirmAi, onCancelAiConfirm }) {
  const body = [];

  if (status === 'idle') {
    body.push(el('button', { type: 'button', class: 'button button--secondary', onClick: onLoad }, 'Ver narrativa'));
  } else if (status === 'loading') {
    body.push(renderStatusMessage({ kind: 'loading', title: 'Cargando narrativa…' }));
  } else if (status === 'loaded' && narrative) {
    body.push(renderExisting(narrative));
  } else if (status === 'generating') {
    body.push(renderStatusMessage({ kind: 'loading', title: 'Generando narrativa…' }));
  } else if (status === 'error') {
    body.push(renderStatusMessage({ kind: 'error', title: 'No se pudo generar la narrativa', text: error ?? undefined }));
  }

  if (status === 'loaded' || status === 'none' || status === 'error') {
    const actions = el('div', { class: 'radar-filter__row' }, [
      el('button', { type: 'button', class: 'button', onClick: onGenerateDeterministic }, 'Generar narrativa (determinística)'),
      el('button', { type: 'button', class: 'button button--secondary', onClick: onRequestAiConfirm }, 'Generar narrativa con IA (opcional)'),
    ]);
    body.push(actions);

    if (aiConfirmOpen) {
      body.push(
        el('div', { class: 'narrative-section__ai-confirm stack' }, [
          renderStatusMessage({ kind: 'warning', title: 'Antes de continuar', text: AI_WARNING }),
          el('div', { class: 'radar-filter__row' }, [
            el('button', { type: 'button', class: 'button', onClick: onConfirmAi }, 'Sí, generar con IA'),
            el('button', { type: 'button', class: 'button button--secondary', onClick: onCancelAiConfirm }, 'Cancelar'),
          ]),
        ])
      );
    }
  }

  return el('details', { class: 'narrative-section' }, [el('summary', {}, 'Narrativa (texto corrido, opcional)'), el('div', { class: 'stack' }, body)]);
}
