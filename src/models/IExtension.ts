import Wire from '../Wire';
import { HandshakeExtensions, ExtendedHandshake } from '../Extension';

export interface IExtension {
  wire: Wire;
  name: string;
  requirePeer?: boolean;
  onHandshake: (infoHash: string, peerId: string, extensions: HandshakeExtensions) => void;
  onExtendedHandshake: (handshake: ExtendedHandshake) => void;
  onMessage: (buf: Buffer) => void;
}
