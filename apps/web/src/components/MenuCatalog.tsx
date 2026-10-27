import { useCallback, useRef, useState, type CSSProperties, type DragEvent } from 'react';
import { Coffee, ChevronRight, Plus } from 'lucide-react';
import { createPortal } from 'react-dom';
import { accessibleBrandColor, formatMoney, type PublicMenu, type MenuProduct } from '@cafe/domain';
import { supabase } from '../lib/supabase';
import './menu-designer.css';
import { menuBackground, menuEffects, menuInk } from '../lib/menu-effects';
import { MenuIntro } from './MenuIntro';
import './menu-effects.css';

export function menuImage(path?: string | null, bucket = 'cafe-branding') {
  if (!path) return undefined;
  return /^(https?:|blob:|data:|\/)/.test(path) ? path : supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
export function MenuCatalog({ menu, onAdd, onImageDrop, fullScreenIntro = false }: {
  menu: PublicMenu; onAdd?: (product: MenuProduct) => void;
  fullScreenIntro?: boolean;
  onImageDrop?: (field: 'logo_path' | 'hero_background_path', file: File) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const category = menu.categories.find(c => c.id === selected);
  const cafe = menu.cafe;
  const effects = menuEffects(cafe);
  const [introActive, setIntroActive] = useState(() => effects.intro_style !== 'none' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const catalogBody = useRef<HTMLDivElement>(null);
  const finishIntro = useCallback(() => {
    const restoreFocus = document.activeElement?.closest('.menu-intro');
    setIntroActive(false);
    if (restoreFocus) requestAnimationFrame(() => catalogBody.current?.focus());
  }, []);
  const cover = cafe.hero_background_type === 'image' ? menuImage(cafe.hero_background_url) : undefined;
  const intro = <MenuIntro name={cafe.name} logo={menuImage(cafe.logo_url)} effects={effects} onFinish={finishIntro}
    fullScreen={fullScreenIntro} brand={accessibleBrandColor(cafe.primary_color)} />;
  function drop(e: DragEvent, field: 'logo_path' | 'hero_background_path') {
    if (!onImageDrop) return;
    e.preventDefault(); e.stopPropagation();
    if (e.dataTransfer.files[0]) onImageDrop(field, e.dataTransfer.files[0]);
  }
  return <div className={`menu-catalog template-${cafe.template_id || 'cafe'} motion-${effects.menu_animation} ${effects.menu_background_color ? 'custom-background' : ''} ${effects.menu_background_end ? 'gradient-background' : ''}`} style={{
    '--brand': accessibleBrandColor(cafe.primary_color), '--accent': accessibleBrandColor(cafe.accent_color),
    '--cover-color': cafe.hero_background_color || '#F3E7D7',
    '--catalog-background': menuBackground(effects),
    '--catalog-ink': menuInk(effects.menu_background_color || '#FFFFFF'),
  } as CSSProperties}>
    <div ref={catalogBody} tabIndex={-1} inert={introActive} className="catalog-body">
    <header className={`catalog-header position-${cafe.logo_position || 'overlap'}`}>
      <div className="catalog-cover" style={cover ? { backgroundImage: `url("${cover}")` } : undefined}
        onDragOver={e => { if (onImageDrop) e.preventDefault(); }} onDrop={e => drop(e, 'hero_background_path')}>
        {onImageDrop && <span className="cover-drop-hint">Déposez votre couverture ici</span>}
      </div>
      <div className="catalog-logo" onDragOver={e => { if (onImageDrop) e.preventDefault(); }} onDrop={e => drop(e, 'logo_path')}
        title={onImageDrop ? 'Déposez votre logo ici' : undefined}>
        {cafe.logo_url ? <img src={menuImage(cafe.logo_url)} alt={`Logo ${cafe.name}`} /> : <Coffee size={36} />}
      </div>
      <div className="catalog-heading"><h1>{cafe.name}</h1>{cafe.description && <p>{cafe.description}</p>}
        <span className="catalog-table">{menu.table.valid ? menu.table.label : 'Découvrez notre carte'}</span>
      </div>
    </header>
    <nav className="catalog-nav" aria-label="Catégories du menu">
      <button type="button" aria-pressed={!category} onClick={() => setSelected(null)}>Toute la carte</button>
      {menu.categories.map(c => <button type="button" key={c.id} aria-pressed={c.id === category?.id} onClick={() => setSelected(c.id)}>{c.name}</button>)}
    </nav>
    <section className="catalog-content" key={`${category?.id || 'categories'}-${introActive}`}>
      <div className="catalog-section-title"><span>{category ? 'À déguster' : 'À la carte'}</span><h2>{category?.name || 'Une envie ?'}</h2>
        {category && <button type="button" onClick={() => setSelected(null)}>← Catégories</button>}</div>
      {!category ? <div className="catalog-categories">
        {menu.categories.map(c => <button type="button" className="catalog-category" key={c.id} onClick={() => setSelected(c.id)}>
          <div className="catalog-category-photo">{c.image_url ? <img src={menuImage(c.image_url, 'product-images')} alt="" /> : <Coffee />}</div>
          <span><strong>{c.name}</strong><small>{c.products.length} produit{c.products.length === 1 ? '' : 's'}</small></span><ChevronRight size={18} />
        </button>)}
      </div> : <div className="catalog-products">
        {category.products.map(p => <article className={`catalog-product ${p.available ? '' : 'unavailable'}`} key={p.id}>
          <div><h3>{p.name}</h3>{p.description && <p>{p.description}</p>}<strong>{formatMoney(p.price_minor, cafe.currency)}</strong>
            {!p.available && <small>Indisponible</small>}
          </div>
          <div className="catalog-product-photo">{p.photo_url ? <img src={menuImage(p.photo_url, 'product-images')} alt="" /> : <Coffee />}
            {onAdd && <button type="button" disabled={!p.available} aria-label={`Ajouter ${p.name}`} onClick={() => onAdd(p)}><Plus size={18} /></button>}
          </div>
        </article>)}
        {!category.products.length && <p className="catalog-empty">Les produits arrivent bientôt.</p>}
      </div>}
      {!menu.categories.length && <p className="catalog-empty">Notre carte arrive bientôt.</p>}
      <footer className="catalog-footer">{cafe.contact_address && <p>{cafe.contact_address}</p>}{cafe.contact_phone && <a href={`tel:${cafe.contact_phone}`}>{cafe.contact_phone}</a>}<small>{cafe.name} · Bon appétit</small></footer>
    </section>
    </div>
    {introActive && (fullScreenIntro ? createPortal(intro, document.body) : intro)}
  </div>;
}
