import { describe, expect, it } from 'vitest';
import { effectDefaults, introPalette, menuBackground, menuEffects, menuInk } from './menu-effects';

describe('menu design compatibility and validation', () => {
  it.each(['card', 'rings'] as const)('preserves the distinct %s intro and custom colors', (intro_style) => {
    const settings = { intro_style, intro_background_color: '#132e25', intro_text_color: '#ffeedd', intro_accent_color: '#dd9944', intro_surface_color: '#221100' };
    const effects = menuEffects(settings);
    expect(effects).toMatchObject(settings);
    expect(introPalette(effects, '#0000FF')).toMatchObject({ background: '#132e25', text: '#ffeedd', accent: '#dd9944', surface: '#221100' });
  });
  it('rejects invalid intro colors and computes readable default card text', () => {
    const effects = menuEffects({ intro_style: 'card', intro_background_color: 'red', intro_text_color: 'url(x)', intro_accent_color: '#xyzxyz', intro_surface_color: '#fff' });
    expect(effects.intro_background_color).toBeNull();
    expect(effects.intro_text_color).toBeNull();
    expect(effects.intro_accent_color).toBeNull();
    expect(effects.intro_surface_color).toBeNull();
    expect(introPalette(effects, '#123456')).toMatchObject({ background: '#123456', surface: '#FFFFFF', text: '#000000' });
  });
  it('keeps older publications unchanged and disables motion by default', () => {
    expect(menuEffects({})).toEqual(effectDefaults);
    expect(menuBackground(effectDefaults)).toBe('#FFFFFF');
  });
  it('supports a custom solid background and two-color gradient', () => {
    const solid = menuEffects({ menu_background_color: '#123456' });
    expect(menuBackground(solid)).toBe('#123456');
    expect(menuBackground({ ...solid, menu_background_end: '#abcdef' })).toBe('linear-gradient(135deg, #123456, #abcdef)');
  });
  it('rejects malformed CSS colors and unknown effects from legacy data', () => {
    expect(menuEffects({ menu_background_color: 'url(https://example.com)', menu_background_end: 'red' })).toEqual(effectDefaults);
    expect(menuEffects({ menu_animation: 'invalid', intro_style: 'invalid' } as never)).toEqual(effectDefaults);
  });
  it('bounds intro duration and preserves valid effect choices', () => {
    expect(menuEffects({ intro_duration_ms: 0 }).intro_duration_ms).toBe(1000);
    expect(menuEffects({ intro_duration_ms: 90000 }).intro_duration_ms).toBe(4000);
    expect(menuEffects({ intro_duration_ms: NaN }).intro_duration_ms).toBe(1800);
    expect(menuEffects({ intro_style: 'curtain', menu_animation: 'rise', intro_duration_ms: 2500 })).toMatchObject({ intro_style: 'curtain', menu_animation: 'rise', intro_duration_ms: 2500 });
  });
  it('chooses readable text for light and dark backgrounds', () => {
    expect(menuInk('#000000')).toBe('#FFFFFF');
    expect(menuInk('#FFFFFF')).toBe('#000000');
  });
});
