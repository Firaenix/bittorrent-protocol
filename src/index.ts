import { Extension } from './Extension';
import Wire from './Wire';

export * as Wire from './Wire';
export { ExtendedHandshake, ExtendedHandshakeMessageParams, Extension, HandshakeExtensions } from './Extension';
export { IExtension } from './models/IExtension';
export { MESSAGE_CHOKE, MESSAGE_INTERESTED, MESSAGE_KEEP_ALIVE, MESSAGE_PORT, MESSAGE_PROTOCOL, MESSAGE_RESERVED, MESSAGE_UNCHOKE, MESSAGE_UNINTERESTED } from './models/PeerMessages';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).Extension = Extension;
module.exports.Extension = Extension;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).Wire = Wire;
module.exports = Wire;
