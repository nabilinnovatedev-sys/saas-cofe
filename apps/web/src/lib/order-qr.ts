import QRCode from 'qrcode';

/** High correction level reserves room for a small, legible centre label. */
export async function orderQr(url: string, label: string): Promise<string> {
  const canvas = document.createElement('canvas');
  await QRCode.toCanvas(canvas, url, { width: 1024, margin: 4, errorCorrectionLevel: 'H', color: { dark: '#2B2118', light: '#FFFFFF' } });
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Impossible de générer le QR.');
  const width = 182, height = 90, center = canvas.width / 2;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(center - width / 2, center - height / 2, width, height);
  ctx.fillStyle = '#2B2118';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  let size = 46;
  do { ctx.font = `bold ${size--}px sans-serif`; } while (ctx.measureText(label).width > width - 18 && size > 8);
  ctx.fillText(label, center, center);
  return canvas.toDataURL('image/png');
}
