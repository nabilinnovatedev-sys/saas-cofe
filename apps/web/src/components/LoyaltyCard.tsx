import { useEffect, useState, type CSSProperties } from 'react';
import QRCode from 'qrcode';
import { Coffee, Gift, Star } from 'lucide-react';
import { loyaltyProgress, type LoyaltyMember, type LoyaltyProgram } from '@cafe/domain';
import { menuImage } from './MenuCatalog';
import './loyalty.css';

export function LoyaltyQr({ value, label }: { value: string; label: string }) {
  const [src, setSrc] = useState('');
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    setSrc(''); setError(false);
    QRCode.toDataURL(value, { width: 320, margin: 4, errorCorrectionLevel: 'M' }).then(result => { if (active) setSrc(result); }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [value]);
  return error ? <p role="alert">QR indisponible. Utilisez le lien.</p> : src ? <img className="loyalty-qr" src={src} alt={label} /> : <p>Préparation du QR…</p>;
}

export function LoyaltyCard({ program, name, member }: { program: LoyaltyProgram; name: string; member: LoyaltyMember | null }) {
  const progress = loyaltyProgress(member?.points || 0, program.threshold);
  const Icon = program.stamp === 'gift' ? Gift : program.stamp === 'star' ? Star : Coffee;
  return <article className={`loyalty-card loyalty-card--${program.template}`} style={{
    '--loyalty-bg': program.background_color, '--loyalty-surface': program.surface_color,
    '--loyalty-ink': program.text_color, '--loyalty-accent': program.accent_color,
  } as CSSProperties} aria-label="Carte de fidélité">
    <header><div className="loyalty-logo">{program.logo_path ? <img src={menuImage(program.logo_path)} alt={`Logo ${name}`} /> : <Coffee />}</div><div><small>LE CLUB DES HABITUÉS</small><h2>{name}</h2></div></header>
    <div className="loyalty-stamp-area"><p>Chaque visite compte.</p><div className="loyalty-stamps" aria-label={`${progress.balance} points sur ${progress.goal}`}>
      {Array.from({ length: progress.goal }, (_, i) => <span className={i < progress.filled ? 'earned' : ''} key={i}>{i < progress.filled ? <Icon aria-hidden="true" /> : <span>{i + 1}</span>}</span>)}
    </div><strong>{progress.balance} points</strong><span> / {progress.goal} pour une récompense</span></div>
    <div className="loyalty-card-bottom"><small>VOTRE PROCHAINE ATTENTION</small><h3>{program.reward}</h3><p>{progress.rewards ? `${progress.rewards} récompense${progress.rewards > 1 ? 's' : ''} disponible${progress.rewards > 1 ? 's' : ''}` : `Encore ${progress.remaining} point${progress.remaining > 1 ? 's' : ''}`}</p><hr /><div className="loyalty-owner"><strong>{member?.name || 'Votre nom'}</strong><span>{member ? `+${member.phone}` : 'Votre carte, toujours avec vous'}</span></div></div>
  </article>;
}
