import { Extension } from './Extension';
import Wire from './Wire';

export * as Wire from './Wire';
export { ExtendedHandshake, ExtendedHandshakeMessageParams, Extension, HandshakeExtensions } from './Extension';
export { IExtension } from './models/IExtension';
export { MessageBuffers, MessageFlags } from './models/PeerMessages';

global['Extension'] = Extension;
module.exports.Extension = Extension;

global['Wire'] = Wire;
module.exports = Wire;
