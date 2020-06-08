import Wire from './Wire';
import { IExtension, ExtensionExtraFields } from './models/IExtension';

export type ExtendedHandshakeMessageParams = { [key: string]: any };

/**
 * http://www.bittorrent.org/beps/bep_0010.html
 */
export type ExtendedHandshake = {
  m?: { [name: string]: number };
  exts: {
    [extName: string]: ExtensionExtraFields;
  };
} & ExtendedHandshakeMessageParams;

export type HandshakeExtensions = { [name: string]: boolean };

const NoopAsync = async () => {};

export abstract class Extension implements IExtension {
  public wire: Wire;
  public abstract name: string;
  public abstract requirePeer?: boolean;
  public extraFields?: ExtensionExtraFields;

  constructor(wire: Wire) {
    this.wire = wire;
  }

  public abstract onHandshake: (infoHash: string, peerId: string, extensions: HandshakeExtensions) => void;

  public abstract onExtendedHandshake: (handshake: ExtendedHandshake) => void;

  public abstract onMessage: (buf: Buffer) => void;

  public onPiece = NoopAsync;
  public onFinish = NoopAsync;
  public onCancel = NoopAsync;
  public onRequest = NoopAsync;
  public onBitField = NoopAsync;
  public onHave = NoopAsync;
  public onUninterested = NoopAsync;
  public onInterested = NoopAsync;
  public onUnchoke = NoopAsync;
  public onChoke = NoopAsync;
}
