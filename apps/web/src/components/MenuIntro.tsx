import { useEffect, type CSSProperties } from 'react';
import { Coffee } from 'lucide-react';
import { introPalette, type MenuEffects } from '../lib/menu-effects';

export function MenuIntro({ name, logo, effects, onFinish, fullScreen, brand }: {
  name: string; logo?: string; effects: MenuEffects; onFinish: () => void; fullScreen: boolean; brand: string;
}) {
  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const stopIfReduced = () => { if (motion.matches) onFinish(); };
    stopIfReduced();
    motion.addEventListener('change', stopIfReduced);
    const timer = window.setTimeout(onFinish, effects.intro_duration_ms);
    return () => { window.clearTimeout(timer); motion.removeEventListener('change', stopIfReduced); };
  }, [effects.intro_duration_ms, onFinish]);
  const palette = introPalette(effects, brand);
  return <section className={`menu-intro intro-${effects.intro_style} ${fullScreen ? 'menu-intro-page' : ''}`} aria-label={`Bienvenue chez ${name}`}
    style={{ '--intro-duration': `${effects.intro_duration_ms}ms`, '--brand': brand,
      '--intro-bg': palette.background, '--intro-text': palette.text, '--intro-accent': palette.accent,
      '--intro-surface': palette.surface, '--intro-surface-ink': palette.surfaceInk,
    } as CSSProperties}>
    {effects.intro_style === 'rings' && <div className="intro-rings-art" aria-hidden="true"><i /><i /><i /></div>}
    <div className="intro-brand"><div className="intro-logo">{logo ? <img src={logo} alt={`Logo ${name}`} /> : <Coffee size={48} aria-hidden="true" />}</div>
      <p>{effects.intro_style === 'card' ? 'Votre table vous attend' : 'Bienvenue chez'}</p><h2>{name}</h2><span>{effects.intro_style === 'rings' ? 'Découvrez notre univers' : 'Un moment à savourer'}</span></div>
    <button type="button" onClick={onFinish}>Passer l’intro →</button>
  </section>;
}
