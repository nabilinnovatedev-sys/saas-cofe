import type { PublicMenu } from '@cafe/domain';

export const effectDefaults = {
  menu_background_color: null as string | null,
  menu_background_end: null as string | null,
  menu_animation: 'none' as 'none' | 'fade' | 'rise' | 'zoom',
  intro_style: 'none' as 'none' | 'fade' | 'pulse' | 'curtain' | 'card' | 'rings',
  intro_background_color: null as string | null,
  intro_text_color: null as string | null,
  intro_accent_color: null as string | null,
  intro_surface_color: null as string | null,
  intro_duration_ms: 1800,
};
export type MenuEffects = typeof effectDefaults;
const color = (value: unknown): value is string => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
export function menuEffects(cafe: Partial<PublicMenu['cafe']>): MenuEffects {
  return {
    menu_background_color: color(cafe.menu_background_color) ? cafe.menu_background_color : null,
    menu_background_end: color(cafe.menu_background_end) ? cafe.menu_background_end : null,
    menu_animation: ['fade', 'rise', 'zoom'].includes(cafe.menu_animation || '') ? cafe.menu_animation! : 'none',
    intro_style: ['fade', 'pulse', 'curtain', 'card', 'rings'].includes(cafe.intro_style || '') ? cafe.intro_style! : 'none',
    intro_background_color: color(cafe.intro_background_color) ? cafe.intro_background_color : null,
    intro_text_color: color(cafe.intro_text_color) ? cafe.intro_text_color : null,
    intro_accent_color: color(cafe.intro_accent_color) ? cafe.intro_accent_color : null,
    intro_surface_color: color(cafe.intro_surface_color) ? cafe.intro_surface_color : null,
    intro_duration_ms: Math.min(4000, Math.max(1000, Number.isFinite(cafe.intro_duration_ms) ? cafe.intro_duration_ms! : 1800)),
  };
}
export function menuBackground(effects: MenuEffects): string {
  const start = effects.menu_background_color || '#FFFFFF';
  return effects.menu_background_end ? `linear-gradient(135deg, ${start}, ${effects.menu_background_end})` : start;
}
export function introPalette(effects: MenuEffects, brand: string) {
  const background = effects.intro_background_color || brand;
  const surface = effects.intro_surface_color || '#FFFFFF';
  return {
    background, surface,
    text: effects.intro_text_color || menuInk(effects.intro_style === 'card' ? surface : background),
    accent: effects.intro_accent_color || menuInk(background),
    surfaceInk: menuInk(surface),
  };
}
// Text uses an opaque surface for gradients, where a single foreground cannot
// guarantee contrast at every point of the background.
export function menuInk(background: string): string {
  const channels = background.slice(1).match(/../g)!.map(hex => {
    const value = parseInt(hex, 16) / 255;
    return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
  });
  const luminance = channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
  return luminance > .179 ? '#000000' : '#FFFFFF';
}
