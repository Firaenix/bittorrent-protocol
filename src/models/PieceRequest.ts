export class PieceRequest {
  public piece: number;
  public offset: number;
  public length: number;
  public callback: RequestCallback;

  constructor(piece: number, offset: number, length: number, cb: RequestCallback) {
    this.piece = piece;
    this.offset = offset;
    this.length = length;
    this.callback = cb;
  }
}

export type RequestCallback = (err: Error | null | undefined, buf: Buffer | null | undefined) => void;
