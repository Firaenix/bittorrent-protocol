import Wire from '../Wire';
import { HandshakeExtensions, ExtendedHandshake } from '../Extension';
import { BitFieldData } from 'bitfield';

export type ExtensionExtraFields = { [key: string]: Buffer };

export interface IExtension {
  wire: Wire;
  name: string;
  requirePeer?: boolean;
  extraFields?: ExtensionExtraFields;

  sendExtendedMessage: (data: object) => void;

  onHandshake: (infoHash: string, peerId: string, extensions: HandshakeExtensions) => void;
  onExtendedHandshake: (handshake: ExtendedHandshake) => void;
  onMessage: (buf: Buffer) => void;

  // ================== Async Message Interceptors ==========================
  onPiece: (index: number, offset: number, buffer: Buffer) => Promise<void>;
  onFinish: () => Promise<void>;
  onCancel: (index: number, offset: number, length: number) => Promise<void>;
  onRequest: (index: number, offset: number, length: number) => Promise<void>;
  onBitField: (bitfield: BitFieldData) => Promise<void>;
  onHave: (index: number) => Promise<void>;
  onUninterested: () => Promise<void>;
  onInterested: () => Promise<void>;
  onUnchoke: () => Promise<void>;
  onChoke: () => Promise<void>;
}
