import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { en } from '../src/lib/i18n/messages/en';
import { es } from '../src/lib/i18n/messages/es';
import { zh } from '../src/lib/i18n/messages/zh';
import { bn } from '../src/lib/i18n/messages/bn';

// DHCR registration data is building-level: it shows a building has
// registered stabilized units, not that a given apartment is one of them.
// These tests guard against copy that implies unit-level certainty.

const locales = { en, es, zh, bn } as const;

test('copy: positive verdict tells every tenant to request their apartment rent history (REC-1)', () => {
  for (const [lang, m] of Object.entries(locales)) {
    assert.match(m['result.stabilized.sub'], /REC-1/, `${lang}: result.stabilized.sub`);
  }
});

test('copy: hero headline does not promise to check every apartment', () => {
  assert.doesNotMatch(en['hero.headline'], /every rent-stabilized apartment/i);
  assert.doesNotMatch(es['hero.headline'], /cada apartamento/i);
  assert.doesNotMatch(zh['hero.headline'], /每一套/);
  assert.doesNotMatch(bn['hero.headline'], /প্রতিটি/);
});

test('copy: meta title/description do not claim to tell whether an apartment is stabilized', () => {
  const layout = readFileSync(new URL('../src/app/layout.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(layout, /if your apartment is rent-stabilized/i);
  assert.doesNotMatch(layout, /Check any NYC apartment/i);
});

test('copy: Info page says we count anonymous usage and never store addresses', () => {
  const story = readFileSync(new URL('../src/app/info/story.tsx', import.meta.url), 'utf8');
  assert.match(story, /count anonymous usage/i);
  assert.match(story, /never store (your )?address/i);
});
