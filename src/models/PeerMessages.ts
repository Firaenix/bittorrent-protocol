export const MESSAGE_PROTOCOL = Buffer.from('\u0013BitTorrent protocol');
export const MESSAGE_KEEP_ALIVE = Buffer.from([0x00, 0x00, 0x00, 0x00]);
export const MESSAGE_CHOKE = Buffer.from([0x00, 0x00, 0x00, 0x01, 0x00]);
export const MESSAGE_UNCHOKE = Buffer.from([0x00, 0x00, 0x00, 0x01, 0x01]);
export const MESSAGE_INTERESTED = Buffer.from([0x00, 0x00, 0x00, 0x01, 0x02]);
export const MESSAGE_UNINTERESTED = Buffer.from([0x00, 0x00, 0x00, 0x01, 0x03]);
export const MESSAGE_RESERVED = [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
export const MESSAGE_PORT = [0x00, 0x00, 0x00, 0x03, 0x09, 0x00, 0x00];