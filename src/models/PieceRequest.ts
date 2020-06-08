export class PieceRequest {
  public piece: number;
  public offset: number;
  public length: number;
  public callback: Function;

  constructor(piece: number, offset: number, length: number, cb: Function) {
    this.piece = piece;
    this.offset = offset;
    this.length = length;
    this.callback = cb;
  }
}
