import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { loyaltyError, loyaltyPhone, type LoyaltyView } from '@cafe/domain';
import { LoyaltyCard } from '../components/LoyaltyCard';
import { deviceCredential, loyalty } from '../lib/loyalty';

export default function Loyalty() {
  const { slug = '' } = useParams();
  const [credential, setCredential] = useState('');
  const [view, setView] = useState<LoyaltyView | null>(null);
  const [name, setName] = useState(''), [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [grant, setGrant] = useState<{ kind: string; token: string } | null>(() => {
    const params = new URLSearchParams(location.hash.slice(1));
    const kind = params.has('recover') ? 'recover' : 'award';
    const token = params.get(kind);
    return token ? { kind, token } : null;
  });
  const [reward, setReward] = useState<{ code: string; expires_at: string } | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    let active = true;
    setLoading(true);
    try {
      const token = deviceCredential(slug);
      setCredential(token);
      loyalty<LoyaltyView>('view', { slug, credential: token }).then(async result => {
        if (!active) return;
        setView(result);
        if (result.member && grant?.kind === 'award') {
          const updated = await loyalty<LoyaltyView>('claim', { slug, credential: token, token: grant.token });
          if (active) {
            setView(updated); setGrant(null); setNotice('Votre point a été ajouté !');
            history.replaceState(null, '', location.pathname);
          }
        }
      }).catch(e => { if (active) setError(loyaltyError(e)); }).finally(() => { if (active) setLoading(false); });
    } catch { setError('Autorisez le stockage local du navigateur pour conserver votre carte.'); setLoading(false); }
    return () => { active = false; };
  }, [slug]);
  useEffect(() => {
    if (!reward) return;
    const timer = setInterval(() => {
      const time = Date.now(); setNow(time);
      if (new Date(reward.expires_at).getTime() <= time) setReward(null);
    }, 1000);
    const refresh = setInterval(() => {
      loyalty<LoyaltyView>('view', { slug, credential }).then(result => {
        if (view?.member && result.member && result.member.points < view.member.points) {
          setReward(null); setNotice('Récompense remise ! À très bientôt.');
        }
        setView(result);
      }).catch(() => { /* Keep the last known balance; user can explicitly refresh. */ });
    }, 15000);
    return () => { clearInterval(timer); clearInterval(refresh); };
  }, [reward, slug, credential, view?.member?.points]);
  async function action(kind: 'join' | 'claim' | 'view' | 'reward_code', event?: FormEvent) {
    event?.preventDefault();
    if (busy || !credential) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const body: Record<string, unknown> = { slug, credential };
      if (kind === 'join') { body.name = name; body.phone = loyaltyPhone(phone); }
      if (kind === 'claim') body.token = grant?.token;
      if (kind === 'reward_code') {
        setNow(Date.now()); setReward(await loyalty('reward_code', body));
      } else {
        let result = await loyalty<LoyaltyView>(kind, body);
        if (kind === 'join' && grant?.kind === 'award') {
          setView(result); // Enrollment remains available if this QR has expired.
          result = await loyalty<LoyaltyView>('claim', { slug, credential, token: grant.token });
          setGrant(null); history.replaceState(null, '', location.pathname);
          setNotice('Votre point a été ajouté. Bienvenue au club !');
        }
        if (kind === 'claim') {
          setNotice(grant?.kind === 'recover' ? 'Carte retrouvée sur ce téléphone.' : 'Votre point a été ajouté !');
          setGrant(null); history.replaceState(null, '', location.pathname);
        }
        setView(result);
      }
    } catch (e) { setError(loyaltyError(e)); }
    finally { setBusy(false); }
  }
  if (loading) return <main className="state-page">Ouverture de votre carte…</main>;
  return <main className="loyalty-public" style={{ background: view?.program.background_color }}>
    <div className="loyalty-public-inner">
      {view && <LoyaltyCard program={view.program} name={view.cafe.name} member={view.member} />}
      <section className="loyalty-actions">
        {!view && <h1>Carte de fidélité</h1>}
        {error && <p className="alert error" role="alert">{error}</p>}
        {notice && <p className="alert" role="status">{notice}</p>}
        {view && grant?.kind === 'recover' ? <><h2>Retrouver ma carte</h2><p>Utilisez ce QR uniquement si votre serveur vient de vous le remettre en personne. L’ancien téléphone perdra l’accès.</p><button className="btn" disabled={busy} onClick={() => action('claim')}>Retrouver ma carte sur ce téléphone</button></> : view && !view.member ? <form onSubmit={e => action('join', e)}>
          <h2>Bienvenue au club.</h2><p>Votre nom et votre numéro suffisent. Aucun SMS ni mot de passe.</p>
          <label>Votre nom<input required maxLength={100} autoComplete="name" value={name} onChange={e => setName(e.target.value)} /></label>
          <label>Téléphone<input required type="tel" autoComplete="tel" placeholder="0612345678" value={phone} onChange={e => setPhone(e.target.value)} /></label>
          <p className="loyalty-hint">Ces informations servent à gérer votre fidélité dans ce café, sans inscription marketing. Votre carte sera mémorisée dans ce navigateur. En changeant de téléphone, demandez l’aide du serveur.</p>
          <button className="btn" disabled={busy || !credential}>{busy ? 'Un instant…' : grant ? 'Créer ma carte et recevoir mon point' : 'Créer ma carte'}</button>
        </form> : view?.member && <>
          {grant?.kind === 'award' && <button className="btn" disabled={busy} onClick={() => action('claim')}>Recevoir mon point</button>}
          {view.member.points >= view.program.threshold && <><h2>Une attention vous attend.</h2><p>Demandez votre cadeau au serveur. Les points sont déduits uniquement lors de sa confirmation.</p>
            {reward && new Date(reward.expires_at).getTime() > now ? <div className="loyalty-reward-code"><small>CODE À MONTRER AU SERVEUR</small><strong>{reward.code.match(/.{1,4}/g)?.join(' ')}</strong><span>Expire dans {Math.ceil((new Date(reward.expires_at).getTime() - now) / 1000)} s</span></div> : <button className="btn" disabled={busy} onClick={() => action('reward_code')}>Afficher mon code cadeau</button>}
          </>}
          <button className="btn secondary" disabled={busy} onClick={() => action('view')}>Actualiser mes points</button>
          <p className="loyalty-hint">Gardez ce navigateur pour retrouver votre carte. Ne partagez pas votre code cadeau.</p>
        </>}
        <Link className="text-link" to={`/${slug}`}>Voir le menu →</Link>
      </section>
    </div>
  </main>;
}
