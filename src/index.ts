import { Extension } from './Extension';
import Wire from './Wire';

export { Wire } from './Wire';
export { ExtendedHandshake, ExtendedHandshakeMessageParams, Extension, HandshakeExtensions } from './Extension';
export { IExtension } from './models/IExtension';
export { MessageBuffers, MessageFlags } from './models/PeerMessages';

export default Wire;
global['Wire'] = Wire;
global['Extension'] = Extension;
