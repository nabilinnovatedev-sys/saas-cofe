declare module 'qrcode/lib/core/qrcode' {
  const QRCode: { create(value: string, options?: { errorCorrectionLevel?: string }): { modules: { size: number; data: Uint8Array } } };
  export default QRCode;
}
