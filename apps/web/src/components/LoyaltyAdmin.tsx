import { useEffect, useState, type FormEvent } from 'react';
import { DEFAULT_LOYALTY, loyaltyError, loyaltyPhone, type LoyaltyEvent, type LoyaltyGrant, type LoyaltyMember, type LoyaltyProgram, type LoyaltyReward } from '@cafe/domain';
import { supabase } from '../lib/supabase';
import { loyalty } from '../lib/loyalty';
import { LoyaltyCard, LoyaltyQr } from './LoyaltyCard';
import { ImageDropzone } from './ImageDropzone';
import { menuImage } from './MenuCatalog';

export function LoyaltyAdmin({ cafe }: { cafe: { id: string; name: string; slug: string } }) {
  const [program, setProgram] = useState<LoyaltyProgram>({ ...DEFAULT_LOYALTY });
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [savedEnabled, setSavedEnabled] = useState(false);
  useEffect(() => {
    let active = true;
    supabase.from('loyalty_programs').select('*').eq('cafe_id', cafe.id).maybeSingle().then(({ data, error }) => {
      if (!active) return;
      if (error) setError('Programme indisponible : appliquez la migration fidélité dans Supabase.');
      else if (data) { setProgram(data); setSavedEnabled(data.enabled); }
      setLoading(false);
    });
    return () => { active = false; };
  }, [cafe.id]);
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    const { error } = await supabase.from('loyalty_programs').upsert({ ...program, cafe_id: cafe.id });
    setBusy(false);
    if (error) setError('Enregistrement impossible. Vérifiez vos droits et la migration fidélité.');
    else { setSavedEnabled(program.enabled); setNotice('Programme enregistré. Ces réglages sont immédiatement appliqués aux cartes de ce café.'); }
  }
  async function upload(file: File) {
    setBusy(true);
    try {
      const path = `${cafe.id}/loyalty/${crypto.randomUUID()}.${file.type.split('/')[1]}`;
      const { error } = await supabase.storage.from('cafe-branding').upload(path, file, { contentType: file.type });
      if (error) throw error;
      setProgram(p => ({ ...p, logo_path: path }));
    } finally { setBusy(false); }
  }
  if (loading) return <section className="content-panel">Chargement de la fidélité…</section>;
  return <section className="content-panel">
    <div className="page-header"><div><p className="eyebrow">Un rendez-vous qui donne envie de revenir</p><h2>Votre club fidélité</h2><p>Un achat confirmé = un point. Chaque café possède ses propres cartes et récompenses.</p></div></div>
    <div className="loyalty-editor">
      <form onSubmit={save}>
        <label><span><input type="checkbox" checked={program.enabled} onChange={e => setProgram({ ...program, enabled: e.target.checked })} /> Activer la fidélité</span></label>
        <label>Points nécessaires pour un cadeau<input type="number" min={2} max={100} required value={program.threshold} onChange={e => setProgram({ ...program, threshold: Number(e.target.value) })} /></label>
        <label>Récompense offerte<input required minLength={2} maxLength={160} value={program.reward} onChange={e => setProgram({ ...program, reward: e.target.value })} /></label>
        <p className="loyalty-hint">Changer le seuil conserve les points existants mais change leur valeur. Les codes cadeau déjà affichés devront être régénérés.</p>
        <label>Design<select value={program.template} onChange={e => setProgram({ ...program, template: e.target.value as LoyaltyProgram['template'] })}><option value="classic">Maison — carte classique</option><option value="midnight">Club — en-tête coloré</option><option value="ticket">Ticket — bordure pointillée</option></select></label>
        <label>Tampon<select value={program.stamp} onChange={e => setProgram({ ...program, stamp: e.target.value as LoyaltyProgram['stamp'] })}><option value="coffee">Tasse de café</option><option value="gift">Cadeau</option><option value="star">Étoile</option></select></label>
        <div className="loyalty-colors">{([['background_color', 'Fond'], ['surface_color', 'Carte'], ['text_color', 'Texte'], ['accent_color', 'Tampons']] as const).map(([key, label]) => <label key={key}>{label}<input type="color" value={program[key]} onChange={e => setProgram({ ...program, [key]: e.target.value })} /></label>)}</div>
        <ImageDropzone label="Logo de votre carte" value={program.logo_path ? menuImage(program.logo_path) : null} onFile={upload} disabled={busy} />
        {program.logo_path && <button className="btn secondary" type="button" onClick={() => setProgram({ ...program, logo_path: null })}>Retirer le logo de la carte</button>}
        {error && <p className="alert error" role="alert">{error}</p>}{notice && <p className="alert" role="status">{notice}</p>}
        <button className="btn" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer le programme'}</button>
      </form>
      <aside className="loyalty-preview"><LoyaltyCard program={program} name={cafe.name} member={{ name: 'Votre client', phone: '212600000000', points: 3 }} /><p>Aperçu — données de démonstration</p></aside>
    </div>
    {savedEnabled && <>
      <section className="loyalty-tool" style={{ marginTop: 30 }}><h3>QR d’inscription permanent</h3><p>À imprimer au comptoir : il crée la carte, sans donner de point. Les points passent par le QR temporaire du serveur.</p><LoyaltyQr value={`${location.origin}/fidelite/${cafe.slug}`} label="QR d’inscription fidélité" /><a href={`/fidelite/${cafe.slug}`} target="_blank" rel="noreferrer">Ouvrir la carte client →</a></section>
      <LoyaltyStaff cafeId={cafe.id} />
    </>}
  </section>;
}

export function LoyaltyStaff({ cafeId }: { cafeId: string }) {
  const [grant, setGrant] = useState<LoyaltyGrant | null>(null), [grantState, setGrantState] = useState('');
  const [now, setNow] = useState(Date.now()), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [phone, setPhone] = useState(''), [member, setMember] = useState<LoyaltyMember | null>(null);
  const [code, setCode] = useState(''), [reward, setReward] = useState<LoyaltyReward | null>(null);
  const [events, setEvents] = useState<LoyaltyEvent[]>([]);
  const expired = !!grant && new Date(grant.expires_at).getTime() <= now;
  useEffect(() => {
    if (!grant) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(() => {
      loyalty<{ used: boolean; expired: boolean }>('status', { cafe_id: cafeId, id: grant.id }).then(result => {
        if (result.used) setGrantState('Utilisé — carte mise à jour.');
        else if (result.expired) setGrantState('Expiré ou remplacé.');
      }).catch(() => setGrantState('Connexion perdue — vérifiez le statut avant de continuer.'));
    }, 10000);
    return () => { clearInterval(tick); clearInterval(poll); };
  }, [grant, cafeId]);
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (e) { setError(loyaltyError(e)); } finally { setBusy(false); }
  }
  async function issue(kind: 'award' | 'recover') {
    if (kind === 'recover' && !confirm('Avez-vous vérifié en personne que cette carte appartient au client ? L’ancien téléphone perdra son accès.')) return;
    await run(async () => {
      setGrant(await loyalty('issue', { cafe_id: cafeId, kind, member_id: member?.id })); setNow(Date.now()); setGrantState('');
      setNotice(kind === 'award' ? 'Montrez ce QR au client après son achat. Un seul point, un seul usage.' : 'Montrez ce QR uniquement au propriétaire de la carte.');
    });
  }
  const cleanCode = code.replace(/[\s-]/g, '').toLowerCase();
  return <section className="loyalty-staff">
    <h2>Comptoir fidélité</h2><p>Connecté au café courant uniquement. La connexion Internet est nécessaire.</p>
    {error && <p className="alert error" role="alert">{error}</p>}{notice && <p className="alert" role="status">{notice}</p>}
    <div className="loyalty-staff-grid">
      <section className="loyalty-tool"><h3>1. Valider une visite</h3><p>Après avoir vérifié l’achat, générez un QR à usage unique pour le client.</p><button className="btn" disabled={busy} onClick={() => issue('award')}>Achat confirmé → générer le QR +1</button>
        {grant && <>{!expired && !grantState ? <><LoyaltyQr value={grant.url} label="QR temporaire à scanner par le client" /><span>Expire dans {Math.max(0, Math.ceil((new Date(grant.expires_at).getTime() - now) / 1000))} s</span></> : <p role="status">{grantState || 'QR expiré. Générez-en un nouveau.'}</p>}
          <button className="btn secondary" disabled={busy} onClick={() => run(async () => { const status = await loyalty<{ used: boolean; expired: boolean }>('status', { cafe_id: cafeId, id: grant.id }); setGrantState(status.used ? 'Utilisé — carte mise à jour.' : status.expired ? 'Expiré ou remplacé.' : ''); })}>Vérifier le statut du QR</button></>}
      </section>
      <section className="loyalty-tool"><h3>2. Remettre un cadeau</h3><p>Le client affiche son code cadeau depuis sa carte. Vérifiez le nom avant de confirmer.</p>
        <label>Code cadeau<input value={code} maxLength={16} autoComplete="off" onChange={e => { setCode(e.target.value); setReward(null); }} placeholder="abcd 1234 ef56" /></label>
        <button className="btn secondary" disabled={busy || cleanCode.length !== 12} onClick={() => run(async () => setReward(await loyalty('inspect', { cafe_id: cafeId, token: cleanCode })))}>Vérifier le cadeau</button>
        {reward && <><p><strong>{reward.name}</strong> · téléphone …{reward.phone_suffix}</p><p>{reward.reward} · {reward.cost} points</p><button className="btn" disabled={busy} onClick={() => run(async () => { await loyalty('redeem', { cafe_id: cafeId, token: cleanCode }); setReward(null); setCode(''); setNotice('Cadeau remis et points déduits.'); })}>Confirmer la remise du cadeau</button></>}
      </section>
      <section className="loyalty-tool"><h3>Retrouver une carte</h3><p>Le client a changé de téléphone ? Vérifiez son identité en personne avant de transférer sa carte. Le numéro n’est pas vérifié par SMS.</p>
        <label>Téléphone du client<input type="tel" value={phone} onChange={e => { setPhone(e.target.value); setMember(null); }} /></label>
        <button className="btn secondary" disabled={busy} onClick={() => run(async () => { const data = await loyalty<{ member: LoyaltyMember }>('search', { cafe_id: cafeId, phone: loyaltyPhone(phone) }); setMember(data.member); })}>Rechercher dans ce café</button>
        {member && <><p>{member.name} · {member.points} points</p><button className="btn secondary" disabled={busy} onClick={() => issue('recover')}>Identité vérifiée → QR de récupération</button></>}
      </section>
      <section className="loyalty-tool"><h3>Dernières opérations</h3><button className="btn secondary" disabled={busy} onClick={() => run(async () => { const data = await loyalty<{ events: LoyaltyEvent[] }>('history', { cafe_id: cafeId }); setEvents(data.events); if (!data.events.length) setNotice('Aucune opération pour le moment.'); })}>Actualiser l’historique</button><div className="loyalty-history">{events.map((event, i) => <div key={i}><span>{event.name}<small>{new Date(event.created_at).toLocaleString('fr')} · {event.kind === 'award' ? 'Visite' : event.kind === 'redeem' ? event.reward : 'Récupération'}</small></span><strong>{event.delta > 0 ? '+' : ''}{event.delta}</strong></div>)}</div></section>
    </div>
  </section>;
}
