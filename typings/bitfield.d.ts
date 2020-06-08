declare module 'bitfield' {
  export type BitFieldData = number | number[] | Buffer | Int8Array;

  export default class BitField {
    public grow: number;
    public buffer: Buffer;

    constructor(data?: BitFieldData, opts?: { grow: number });

    public get(i: number): true;
    public set(i: number, b?: boolean): void;
  }
}
