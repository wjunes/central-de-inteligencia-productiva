// Contraste real (prompt seccion 14/31), no una promesa sin comprobar:
// se leen los valores hexadecimales tal como estan escritos en
// src/styles/tokens.css (tema claro) y src/styles/themes.css
// (:root[data-theme='dark'], tema oscuro explicito) y se calcula el
// contraste WCAG real sobre esos mismos valores - si alguien cambia un
// token y rompe el contraste, este test debe fallar.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const tokensCss = readFileSync(join(__dirname, '..', 'src', 'styles', 'tokens.css'), 'utf-8');
const themesCss = readFileSync(join(__dirname, '..', 'src', 'styles', 'themes.css'), 'utf-8');

function parseRootBlock(css, selector) {
  const match = css.match(selector);
  if (!match) throw new Error(`no se encontró el bloque ${selector} en el CSS`);
  const props = {};
  for (const m of match[1].matchAll(/--([\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    props[m[1]] = m[2];
  }
  return props;
}

const light = parseRootBlock(tokensCss, /:root\s*\{([^}]*)\}/);
const dark = parseRootBlock(themesCss, /:root\[data-theme='dark'\]\s*\{([^}]*)\}/);

function hexToRgb(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const int = parseInt(h.slice(0, 6), 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

function relLuminance([r, g, b]) {
  const [R, G, B] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function contrastRatio(hexA, hexB) {
  const L1 = relLuminance(hexToRgb(hexA));
  const L2 = relLuminance(hexToRgb(hexB));
  const [lighter, darker] = L1 > L2 ? [L1, L2] : [L2, L1];
  return (lighter + 0.05) / (darker + 0.05);
}

describe('Contraste real de tokens (WCAG, calculado sobre los valores del CSS)', () => {
  for (const [name, theme] of [['claro', light], ['oscuro', dark]]) {
    test(`tema ${name}: texto principal vs. fondo >= 7:1 (AAA, objetivo del prompt seccion 14, no solo el mínimo)`, () => {
      const ratio = contrastRatio(theme['color-text-primary'], theme['color-background']);
      assert.ok(ratio >= 7, `contraste real = ${ratio.toFixed(2)}:1`);
    });

    test(`tema ${name}: texto secundario vs. fondo >= 4.5:1 (AA)`, () => {
      const ratio = contrastRatio(theme['color-text-secondary'], theme['color-background']);
      assert.ok(ratio >= 4.5, `contraste real = ${ratio.toFixed(2)}:1`);
    });

    test(`tema ${name}: anillo de foco vs. fondo >= 3:1 (contraste de componente de UI, WCAG 1.4.11)`, () => {
      const ratio = contrastRatio(theme['color-focus'], theme['color-background']);
      assert.ok(ratio >= 3, `contraste real = ${ratio.toFixed(2)}:1`);
    });

    test(`tema ${name}: borde visible sobre el fondo (no es el mismo color)`, () => {
      assert.notEqual(theme['color-border'].toLowerCase(), theme['color-background'].toLowerCase());
    });

    for (const token of ['color-success', 'color-warning', 'color-danger', 'color-info', 'color-risk', 'color-opportunity']) {
      test(`tema ${name}: ${token} usado como texto/ícono vs. fondo >= 4.5:1`, () => {
        const ratio = contrastRatio(theme[token], theme['color-background']);
        assert.ok(ratio >= 4.5, `contraste real de ${token} = ${ratio.toFixed(2)}:1`);
      });
    }

    test(`tema ${name}: riesgo y oportunidad son visualmente distintos de danger/success (no la misma variable de color)`, () => {
      assert.notEqual(theme['color-risk'].toLowerCase(), theme['color-danger'].toLowerCase());
      assert.notEqual(theme['color-opportunity'].toLowerCase(), theme['color-success'].toLowerCase());
    });
  }
});

// QA de Situación/Dashboard (Paso 2C-2): los badges nuevos (components.css
// .badge/.badge--*) pintan su texto sobre `--color-surface`, NO sobre
// `--color-background` - un fondo distinto del que el bloque de arriba
// verifica. Sin este test, un cambio a --color-surface, --color-interactive
// o --color-neutral podría romper el contraste real de "Para observar"
// (badge--trend) o "Inteligencia destacada" (badge--status) sin que ningún
// test lo detectara (los otros 4 tokens de badge ya estaban cubiertos contra
// --color-background arriba, pero no contra el fondo real que usan).
describe('Contraste real de los badges de Situación (fondo real: --color-surface, no --color-background)', () => {
  for (const [name, theme] of [['claro', light], ['oscuro', dark]]) {
    for (const token of ['color-risk', 'color-opportunity', 'color-info', 'color-interactive', 'color-neutral', 'color-text-secondary']) {
      test(`tema ${name}: ${token} como texto de badge vs. --color-surface >= 4.5:1`, () => {
        const ratio = contrastRatio(theme[token], theme['color-surface']);
        assert.ok(ratio >= 4.5, `contraste real de ${token} sobre --color-surface = ${ratio.toFixed(2)}:1`);
      });
    }
  }
});
