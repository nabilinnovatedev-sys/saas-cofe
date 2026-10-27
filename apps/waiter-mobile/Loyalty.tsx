import { memo, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
// Pure matrix encoder: no canvas, filesystem, external QR service or native dependency.
import QRCode from 'qrcode/lib/core/qrcode';
import { loyaltyError, loyaltyPhone, type LoyaltyEvent, type LoyaltyGrant, type LoyaltyMember, type LoyaltyReward } from '@cafe/domain';
import { supabase } from './lib/supabase';

async function call<T>(action: string, cafeId: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('loyalty', { body: { action, cafe_id: cafeId, ...body } });
  if (error) {
    let message = error.message;
    try { message = JSON.stringify(await (error.context as Response).json()); } catch { /* Transport failure */ }
    throw new Error(message);
  }
  return data as T;
}

const LocalQr = memo(function LocalQr({ value }: { value: string }) {
  const matrix = useMemo(() => QRCode.create(value, { errorCorrectionLevel: 'M' }).modules, [value]);
  const cell = Math.max(2, Math.floor(256 / (matrix.size + 8)));
  return <View accessibilityLabel="QR fidélité à scanner par le client" accessible style={{ backgroundColor: '#fff', padding: cell * 4, alignSelf: 'center' }}>
    {Array.from({ length: matrix.size }, (_, row) => <View key={row} style={{ flexDirection: 'row' }}>
      {Array.from({ length: matrix.size }, (_, col) => <View key={col} style={{ width: cell, height: cell, backgroundColor: matrix.data[row * matrix.size + col] ? '#000' : '#fff' }} />)}
    </View>)}
  </View>;
});

export function LoyaltyScreen({ cafeId, offline }: { cafeId: string; offline: boolean }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [grant, setGrant] = useState<LoyaltyGrant | null>(null), [status, setStatus] = useState('');
  const [now, setNow] = useState(Date.now());
  const [code, setCode] = useState(''), [reward, setReward] = useState<LoyaltyReward | null>(null);
  const [phone, setPhone] = useState(''), [member, setMember] = useState<LoyaltyMember | null>(null);
  const [events, setEvents] = useState<LoyaltyEvent[]>([]);
  const disabled = busy || offline;
  const cleanCode = code.replace(/[\s-]/g, '').toLowerCase();
  useEffect(() => {
    if (!grant || offline) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(() => {
      call<{ used: boolean; expired: boolean }>('status', cafeId, { id: grant.id }).then(data => {
        setStatus(data.used ? 'Utilisé — carte mise à jour.' : data.expired ? 'Expiré ou remplacé.' : '');
      }).catch(() => setStatus('Connexion perdue. Vérifiez le statut du QR.'));
    }, 10000);
    return () => { clearInterval(tick); clearInterval(poll); };
  }, [grant, cafeId, offline]);
  async function run(action: () => Promise<void>) {
    if (disabled) return;
    setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (e) { setError(loyaltyError(e)); } finally { setBusy(false); }
  }
  async function issue(kind: 'award' | 'recover') {
    await run(async () => {
      setGrant(await call('issue', cafeId, { kind, member_id: member?.id })); setNow(Date.now()); setStatus('');
      setNotice(kind === 'award' ? 'Montrez le QR au client : un scan, un point.' : 'Montrez le QR de récupération uniquement au propriétaire de la carte.');
    });
  }
  return <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
    <Text style={s.title}>Fidélité</Text><Text style={s.muted}>Cartes et récompenses de votre café. Un achat confirmé = un point.</Text>
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
    {notice ? <Text style={s.notice}>{notice}</Text> : null}
    <View style={s.panel}><Text style={s.heading}>Valider une visite</Text><Text>Après avoir vérifié l’achat, montrez un QR à usage unique au client.</Text>
      <Action disabled={disabled} label="Achat confirmé → QR +1" onPress={() => issue('award')} />
      {grant ? <>{!offline && !status && new Date(grant.expires_at).getTime() > now ? <><LocalQr value={grant.url} /><Text style={s.center}>Expire dans {Math.max(0, Math.ceil((new Date(grant.expires_at).getTime() - now) / 1000))} s</Text></> : <Text style={s.notice}>{offline ? 'Hors ligne — QR masqué.' : status || 'QR expiré.'}</Text>}
        <Action disabled={disabled} label="Vérifier le statut" onPress={() => run(async () => { const data = await call<{ used: boolean; expired: boolean }>('status', cafeId, { id: grant.id }); setStatus(data.used ? 'Utilisé — carte mise à jour.' : data.expired ? 'Expiré ou remplacé.' : ''); })} />
      </> : null}
    </View>
    <View style={s.panel}><Text style={s.heading}>Remettre un cadeau</Text><Text>Demandez au client son code cadeau affiché sur sa carte.</Text>
      <TextInput style={s.input} accessibilityLabel="Code cadeau" placeholder="abcd 1234 ef56" autoCapitalize="none" autoCorrect={false} maxLength={16} value={code} onChangeText={value => { setCode(value); setReward(null); }} />
      <Action disabled={disabled || cleanCode.length !== 12} label="Vérifier le cadeau" onPress={() => run(async () => setReward(await call('inspect', cafeId, { token: cleanCode })))} />
      {reward ? <><Text style={s.heading}>{reward.name} · …{reward.phone_suffix}</Text><Text>{reward.reward} — {reward.cost} points</Text><Action disabled={disabled} label="Confirmer la remise du cadeau" onPress={() => Alert.alert('Confirmer la remise', `${reward.reward} pour ${reward.name} ? ${reward.cost} points seront déduits.`, [
        { text: 'Annuler', style: 'cancel' }, { text: 'Cadeau remis', onPress: () => run(async () => { await call('redeem', cafeId, { token: cleanCode }); setReward(null); setCode(''); setNotice('Cadeau remis et points déduits.'); }) },
      ])} /></> : null}
    </View>
    <View style={s.panel}><Text style={s.heading}>Retrouver une carte</Text><Text>Vérifiez l’identité du client en personne. Le numéro n’est pas vérifié par SMS.</Text>
      <TextInput style={s.input} accessibilityLabel="Téléphone du client" placeholder="0612345678" keyboardType="phone-pad" value={phone} onChangeText={value => { setPhone(value); setMember(null); }} />
      <Action disabled={disabled} label="Rechercher dans ce café" onPress={() => run(async () => { const result = await call<{ member: LoyaltyMember }>('search', cafeId, { phone: loyaltyPhone(phone) }); setMember(result.member); })} />
      {member ? <><Text>{member.name} · {member.points} points</Text><Action disabled={disabled} label="QR de récupération" onPress={() => Alert.alert('Identité vérifiée ?', 'L’ancien téléphone perdra son accès. Montrez le nouveau QR uniquement au propriétaire de cette carte.', [{ text: 'Annuler', style: 'cancel' }, { text: 'Identité vérifiée', onPress: () => issue('recover') }])} /></> : null}
    </View>
    <View style={s.panel}><Text style={s.heading}>Historique</Text><Action disabled={disabled} label="Actualiser les opérations" onPress={() => run(async () => { const data = await call<{ events: LoyaltyEvent[] }>('history', cafeId); setEvents(data.events); if (!data.events.length) setNotice('Aucune opération pour le moment.'); })} />
      {events.map((event, i) => <View key={i} style={s.event}><Text style={s.heading}>{event.name} · {event.delta > 0 ? '+' : ''}{event.delta}</Text><Text style={s.muted}>{event.kind === 'award' ? 'Visite' : event.kind === 'redeem' ? event.reward : 'Récupération'} · {new Date(event.created_at).toLocaleString('fr')}</Text></View>)}
    </View>
  </ScrollView>;
}
function Action({ label, disabled, onPress }: { label: string; disabled: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[s.button, disabled && { opacity: .45 }]}><Text style={s.buttonText}>{label}</Text></Pressable>;
}
const s = StyleSheet.create({
  page: { padding: 18, paddingBottom: 60, gap: 16 }, title: { fontSize: 30, fontWeight: '800', color: '#2D2118' },
  heading: { fontSize: 18, fontWeight: '700', color: '#2D2118' }, muted: { color: '#776B60', lineHeight: 20 },
  panel: { backgroundColor: '#fff', borderRadius: 18, padding: 18, gap: 14, borderWidth: 1, borderColor: '#E6DED3' },
  input: { borderWidth: 1, borderColor: '#D8CEC1', borderRadius: 10, padding: 14, fontSize: 17, color: '#2D2118' },
  button: { backgroundColor: '#8B5E3C', borderRadius: 10, padding: 16 }, buttonText: { color: '#fff', fontWeight: '700', textAlign: 'center' },
  error: { backgroundColor: '#FDEDEB', color: '#A32620', padding: 14, borderRadius: 10 }, notice: { backgroundColor: '#EAF3ED', color: '#244D36', padding: 14, borderRadius: 10 },
  center: { textAlign: 'center', color: '#776B60' }, event: { borderTopWidth: 1, borderColor: '#E6DED3', paddingTop: 12, gap: 6 },
});
