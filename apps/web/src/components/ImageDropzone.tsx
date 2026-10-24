import { useEffect, useRef, useState } from 'react';
import { UploadCloud } from 'lucide-react';

export function ImageDropzone({ label, value, onFile, maxMB = 5, disabled = false }: {
  label: string; value?: string | null; onFile: (file: File) => void | Promise<void>; maxMB?: number; disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const [local, setLocal] = useState<string>();
  useEffect(() => () => { if (local) URL.revokeObjectURL(local); }, [local]);
  async function accept(file?: File) {
    if (!file || disabled) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return setError('Choisissez une image JPEG, PNG ou WebP.');
    if (file.size > maxMB * 1024 * 1024) return setError(`Image limitée à ${maxMB} Mo.`);
    setError('');
    try { await onFile(file); setLocal(URL.createObjectURL(file)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Envoi impossible. Réessayez.'); }
  }
  return <div className="image-field">
    <button type="button" disabled={disabled} className={`image-dropzone ${dragging ? 'dragging' : ''}`}
      onClick={() => input.current?.click()}
      onDragOver={e => { e.preventDefault(); if (!disabled) setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); void accept(e.dataTransfer.files[0]); }}>
      {(local || value) ? <img src={local || value || undefined} alt="" /> : <UploadCloud size={28} />}
      <span><strong>{label}</strong><small>{disabled ? 'Envoi en cours…' : 'Glissez une image ici ou cliquez'}</small><small>JPEG, PNG, WebP · {maxMB} Mo max.</small></span>
    </button>
    <input ref={input} type="file" hidden accept="image/jpeg,image/png,image/webp" disabled={disabled}
      onChange={e => { void accept(e.target.files?.[0]); e.target.value = ''; }} />
    {error && <p className="image-error" role="alert">{error}</p>}
  </div>;
}
