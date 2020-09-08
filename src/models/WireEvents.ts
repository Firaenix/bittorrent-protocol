import { ExtensionsMap } from './ExtensionsMap';
import BitField from 'bitfield';
import { RequestCallback } from './PieceRequest';
import { ExtendedHandshake } from '..';

export interface WireEvents {
  finish: () => void;
  close: () => void;
  error: (error: Error) => void;
  upload: (length: number) => void;
  'keep-alive': () => void;
  handshake: (infoHashHex: string, peerIdHex: string, extensions: ExtensionsMap) => void;
  choke: () => void;
  unchoke: () => void;
  interested: () => void;
  uninterested: () => void;
  bitfield: (peerPieces: BitField) => void;
  have: (index: number) => void;

  request: (index: number, offset: number, length: number, callback: RequestCallback) => void;
  download: (length: number) => void;
  piece: (length: number, offset: number, buffer: Buffer) => void;
  cancel: (index: number, offset: number, length: number) => void;
  port: (port: number) => void;

  extension_message: (extensionName: string, message: Buffer) => void;
  missing_extension: (extensionName: string) => void;

  extended_handshake: (message: 'handshake', extendedHandshake: ExtendedHandshake) => void;
  timeout: () => void;
  unknown_message: (message: Buffer) => void;
}
