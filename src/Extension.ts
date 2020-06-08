/* eslint-disable @typescript-eslint/no-unused-vars */
import Wire from './Wire';
import { IExtension, ExtensionExtraFields } from './models/IExtension';
import { BitFieldData } from 'bitfield';

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

  public onPiece = async (index: number, offset: number, buffer: Buffer) => {};
  public onFinish = async () => {};
  public onCancel = async (index: number, offset: number, length: number) => {};
  public onRequest = async (index: number, offset: number, length: number) => {};
  public onBitField = async (bitfield: BitFieldData) => {};
  public onHave = async (index: number) => {};
  public onUninterested = async () => {};
  public onInterested = async () => {};
  public onUnchoke = async () => {};
  public onChoke = async () => {};
}
