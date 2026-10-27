declare module "xlsx/dist/cpexcel.full.mjs" {
  export const utils: {
    decode(codepage: number, bytes: number[] | Uint8Array): string;
    encode(codepage: number, text: string): number[];
    hascp(codepage: number): boolean;
  };
}
