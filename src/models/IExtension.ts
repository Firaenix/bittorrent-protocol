import Wire from '../Wire';
import { HandshakeExtensions, ExtendedHandshake } from '../Extension';

export type ExtensionExtraFields = { [key: string]: Buffer };

export interface IExtension {
  wire: Wire;
  name: string;
  requirePeer?: boolean;
  extraFields?: ExtensionExtraFields;
  onHandshake: (infoHash: string, peerId: string, extensions: HandshakeExtensions) => void;
  onExtendedHandshake: (handshake: ExtendedHandshake) => void;
  onMessage: (buf: Buffer) => void;
}
