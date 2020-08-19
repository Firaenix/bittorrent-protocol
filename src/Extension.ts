/* eslint-disable @typescript-eslint/no-unused-vars */
import Wire from './Wire';
import { IExtension, ExtensionExtraFields } from './models/IExtension';
import { TypedEmitter, ListenerSignature, DefaultListener } from 'tiny-typed-emitter';

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

export abstract class Extension implements IExtension {
  public wire: Wire;
  public abstract name: string;
  public abstract requirePeer?: boolean;
  public extraFields?: ExtensionExtraFields;

  constructor(wire: Wire) {
    this.wire = wire;
  }

  public sendExtendedMessage = (data: object) => {
    this.wire.extended(this.name, data);
  };

  public abstract onHandshake: (infoHash: string, peerId: string, extensions: HandshakeExtensions) => void;

  public abstract onExtendedHandshake: (handshake: ExtendedHandshake) => void;

  public abstract onMessage: (buf: Buffer) => void;
}

export abstract class EventExtension<T extends ListenerSignature<never>> extends TypedEmitter<T> implements IExtension {
  public wire: Wire;
  public abstract name: string;
  public abstract requirePeer?: boolean;
  public extraFields?: ExtensionExtraFields;

  constructor(wire: Wire) {
    super();
    this.wire = wire;
  }

  public sendExtendedMessage = (data: object) => {
    this.wire.extended(this.name, data);
  };

  public abstract onHandshake: (infoHash: string, peerId: string, extensions: HandshakeExtensions) => void;

  public abstract onExtendedHandshake: (handshake: ExtendedHandshake) => void;

  public abstract onMessage: (buf: Buffer) => void;
}
