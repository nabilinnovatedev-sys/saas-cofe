import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Check, Smartphone, Save } from 'lucide-react';
import { normalizeSlug, type PublicMenu } from '@cafe/domain';
import { supabase } from '../lib/supabase';
import { defaultCover, menuTemplates, type TemplateId } from '../lib/menu-templates';
import { ImageDropzone } from './ImageDropzone';
import { MenuCatalog, menuImage } from './MenuCatalog';
import './menu-designer.css';

type Cafe = { id: string; name: string; slug: string; currency: string; contact_phone?: string | null; contact_address?: string | null };
type Branding = {
  template_id: TemplateId; primary_color: string; secondary_color: string; accent_color: string;
  hero_background_type: 'color' | 'image'; hero_background_color: string; hero_background_path: string | null;
  logo_position: 'top' | 'center' | 'overlap'; logo_path: string | null; description: string;
};
const defaults: Branding = {
  template_id: 'cafe', primary_color: '#8B5E3C', secondary_color: '#557A64', accent_color: '#D98C32',
  hero_background_type: 'color', hero_background_color: '#F3E7D7', hero_background_path: null,
  logo_position: 'overlap', logo_path: null, description: '',
};
const demoCategories: PublicMenu['categories'] = [
  { id: 'demo-grill', name: 'Burgers & Grill', image_url: defaultCover, sort_order: 0, products: [
    { id: 'demo-burger', category_id: 'demo-grill', name: 'Burger signature', description: 'Pain brioché, salade croquante et sauce maison.', price_minor: 6500, photo_url: defaultCover, available: true, sort_order: 0 },
    { id: 'demo-steak', category_id: 'demo-grill', name: 'Grill du chef', description: 'Accompagné de légumes de saison.', price_minor: 9500, photo_url: defaultCover, available: true, sort_order: 1 },
  ] },
  { id: 'demo-fresh', name: 'Salades', image_url: defaultCover, sort_order: 1, products: [] },
  { id: 'demo-drinks', name: 'Boissons', image_url: null, sort_order: 2, products: [] },
];

export function MenuDesigner({ cafe }: { cafe: Cafe }) {
  const [brand, setBrand] = useState<Branding>(defaults);
  const [identity, setIdentity] = useState({ name: cafe.name, slug: cafe.slug, contact_phone: cafe.contact_phone || '', contact_address: cafe.contact_address || '' });
  const [categories, setCategories] = useState<PublicMenu['categories']>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const uploadLock = useRef(false);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [b, c, p] = await Promise.all([
          supabase.from('cafe_branding').select('*').eq('cafe_id', cafe.id).maybeSingle(),
          supabase.from('menu_categories').select('*').eq('cafe_id', cafe.id).eq('active', true).order('sort_order'),
          supabase.from('products').select('*').eq('cafe_id', cafe.id).eq('active', true).order('sort_order'),
        ]);
        if (b.error || c.error || p.error) throw b.error || c.error || p.error;
        if (cancelled) return;
        if (b.data) setBrand(Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => [key, b.data[key] ?? fallback])) as Branding);
        setCategories((c.data || []).map(category => ({ id: category.id, name: category.name, image_url: category.image_path, sort_order: category.sort_order,
          products: (p.data || []).filter(product => product.category_id === category.id).map(product => ({ ...product, photo_url: product.photo_path })),
        })));
      } catch (e) { if (!cancelled) setLoadError((e as Error).message || 'Chargement impossible.'); }
      finally { if (!cancelled) setLoading(false); }
    }
    void load();
    return () => { cancelled = true; };
  }, [cafe.id]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  function change(patch: Partial<Branding>) { setBrand(b => ({ ...b, ...patch })); setDirty(true); setMessage(''); }
  function choose(id: TemplateId) {
    const preset = menuTemplates.find(t => t.id === id)!;
    change({ template_id: preset.id, primary_color: preset.primary_color, secondary_color: preset.secondary_color,
      accent_color: preset.accent_color, hero_background_color: preset.hero_background_color, logo_position: preset.logo_position,
      hero_background_type: id === 'grill' ? 'image' : 'color', hero_background_path: brand.hero_background_path || defaultCover });
  }
  async function upload(field: 'logo_path' | 'hero_background_path', file: File) {
    if (uploadLock.current || saving) throw new Error('Attendez la fin de l’envoi en cours.');
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Image JPEG, PNG ou WebP uniquement.');
    if (file.size > 2 * 1024 * 1024) throw new Error('Image limitée à 2 Mo.');
    uploadLock.current = true; setUploading(true); setError('');
    try {
      const ext = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1];
      const path = `${cafe.id}/${field}-${crypto.randomUUID()}.${ext}`;
      const result = await supabase.storage.from('cafe-branding').upload(path, file);
      if (result.error) throw result.error;
      change({ [field]: path, ...(field === 'hero_background_path' ? { hero_background_type: 'image' as const } : {}) });
    } finally { uploadLock.current = false; setUploading(false); }
  }
  async function save(e: FormEvent) {
    e.preventDefault(); if (saving || uploading) return;
    setSaving(true); setError(''); setMessage('');
    try {
      if (brand.hero_background_type === 'image' && !brand.hero_background_path) throw new Error('Choisissez une image de couverture.');
      const a = await supabase.from('cafes').update({ ...identity, slug: normalizeSlug(identity.slug) }).eq('id', cafe.id);
      if (a.error) throw a.error;
      const b = await supabase.from('cafe_branding').upsert({ ...brand, cafe_id: cafe.id });
      if (b.error) throw b.error;
      setDirty(false); setMessage('Design enregistré. Publiez le café pour le rendre visible aux clients.');
    } catch (e) { setError((e as Error).message || 'Enregistrement impossible.'); }
    finally { setSaving(false); }
  }
  const preview: PublicMenu = {
    cafe: { ...identity, ...brand, id: cafe.id, currency: cafe.currency, logo_url: brand.logo_path, hero_background_url: brand.hero_background_path },
    categories: categories.length ? categories : demoCategories, table: { valid: false, id: null, label: null },
  };
  if (loading) return <div className="state-card">Chargement de votre studio…</div>;
  if (loadError) return <div className="alert error" role="alert">{loadError} Rechargez la page pour réessayer.</div>;
  return <section className="menu-studio">
    <div className="studio-title"><div><p className="eyebrow">Votre menu, votre style</p><h2>Le studio du menu</h2><p>Choisissez une base, puis faites-la vôtre.</p></div><span className="studio-live"><span /> Aperçu en direct</span></div>
    <div className="template-gallery" aria-label="Choisir un template">
      {menuTemplates.map(t => <button type="button" key={t.id} className={`template-choice ${brand.template_id === t.id ? 'selected' : ''}`} aria-pressed={brand.template_id === t.id} disabled={saving}
        onClick={() => choose(t.id)}>
        <div className={`template-thumbnail thumb-${t.id}`} style={{ '--thumb': t.hero_background_color, '--ink': t.primary_color } as React.CSSProperties}>
          <div className="thumb-cover">{t.id === 'grill' && <img src={defaultCover} alt="" />}</div><span className="thumb-logo">{t.id === 'grill' ? 'B&G' : t.id === 'cafe' ? 'CM' : 'FG'}</span>
          <strong>{t.name}</strong><div className="thumb-pills"><i /><i /><i /></div><div className="thumb-cards"><i /><i /><i /></div>
        </div>
        <div className="template-caption"><strong>{t.name}</strong>{brand.template_id === t.id && <Check size={18} />}<small>{t.description}</small></div>
      </button>)}
    </div>
    <div className="studio-workbench">
      <form onSubmit={save} className="studio-controls">
        <fieldset disabled={saving || uploading}>
          <legend>01 · Identité</legend>
          {(['name', 'slug'] as const).map(key => <label key={key}>{key === 'name' ? 'Nom du café' : 'Adresse du menu (slug)'}<input required value={identity[key]} onChange={e => { setIdentity({ ...identity, [key]: e.target.value }); setDirty(true); }} /></label>)}
          <label>Description<textarea rows={3} maxLength={1000} value={brand.description} onChange={e => change({ description: e.target.value })} /></label>
          <ImageDropzone label="Votre logo" value={menuImage(brand.logo_path)} maxMB={2} disabled={uploading || saving} onFile={file => upload('logo_path', file)} />
          <label>Position du logo<select value={brand.logo_position} onChange={e => change({ logo_position: e.target.value as Branding['logo_position'] })}><option value="top">En haut à gauche</option><option value="center">Au centre de la couverture</option><option value="overlap">À cheval sur la couverture</option></select></label>
        </fieldset>
        <fieldset disabled={saving || uploading}>
          <legend>02 · Couverture & couleurs</legend>
          <div className="studio-segment"><button type="button" aria-pressed={brand.hero_background_type === 'color'} onClick={() => change({ hero_background_type: 'color' })}>Couleur unie</button><button type="button" aria-pressed={brand.hero_background_type === 'image'} onClick={() => change({ hero_background_type: 'image' })}>Image</button></div>
          {brand.hero_background_type === 'image' && <ImageDropzone label="Image de couverture" value={menuImage(brand.hero_background_path)} maxMB={2} disabled={uploading || saving} onFile={file => upload('hero_background_path', file)} />}
          <div className="studio-colors">{([['hero_background_color', 'Fond'], ['primary_color', 'Principale'], ['secondary_color', 'Panier'], ['accent_color', 'Accent']] as const).map(([key, label]) => <label key={key}>{label}<input type="color" value={brand[key]} onChange={e => change({ [key]: e.target.value })} /><small>{brand[key]}</small></label>)}</div>
        </fieldset>
        <fieldset disabled={saving}><legend>03 · Contact</legend>{(['contact_phone', 'contact_address'] as const).map(key => <label key={key}>{key === 'contact_phone' ? 'Téléphone' : 'Adresse'}<input value={identity[key]} onChange={e => { setIdentity({ ...identity, [key]: e.target.value }); setDirty(true); }} /></label>)}</fieldset>
        {error && <div role="alert" className="alert error">{error}</div>}{message && <div role="status" className="alert info">{message}</div>}
        <div className="studio-save"><small>{uploading ? 'Envoi de l’image…' : dirty ? 'Modifications non enregistrées' : 'Personnalisez votre menu'}</small><button className="btn primary" disabled={saving || uploading}><Save size={18} />{saving ? 'Enregistrement…' : 'Enregistrer le design'}</button></div>
      </form>
      <aside className="studio-preview">
        <div className="phone-caption"><Smartphone size={18} /><strong>Vue téléphone</strong><span>375 px</span></div>
        <div className="phone-frame"><div className="phone-status"><span>9:41</span><i /><span>▮▮▮ ▰</span></div><div className="phone-screen">
          <MenuCatalog menu={preview} onImageDrop={(field, file) => { void upload(field, file).catch(e => setError(e.message)); }} />
        </div><div className="phone-bottom"><i /></div></div>
        <p>Cliquez sur les catégories pour explorer. Glissez vos images sur la couverture ou le logo.</p>
        {!categories.length && <p className="demo-notice">Contenu de démonstration uniquement. Ajoutez vos catégories et produits dans l’onglet Menu.</p>}
      </aside>
    </div>
  </section>;
}
