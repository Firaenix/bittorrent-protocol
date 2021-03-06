export const MessageBuffers = {
  MESSAGE_PROTOCOL: Buffer.from('\u0013BitTorrent protocol'),
  MESSAGE_KEEP_ALIVE: Buffer.from([0x00, 0x00, 0x00, 0x00]),
  MESSAGE_CHOKE: Buffer.from([0x00, 0x00, 0x00, 0x01, 0x00]),
  MESSAGE_UNCHOKE: Buffer.from([0x00, 0x00, 0x00, 0x01, 0x01]),
  MESSAGE_INTERESTED: Buffer.from([0x00, 0x00, 0x00, 0x01, 0x02]),
  MESSAGE_UNINTERESTED: Buffer.from([0x00, 0x00, 0x00, 0x01, 0x03]),
  MESSAGE_RESERVED: [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
  MESSAGE_PORT: [0x00, 0x00, 0x00, 0x03, 0x09, 0x00, 0x00],
  INFOHASH_SPLIT: Buffer.from(':')
};

export enum MessageParams {
  INFOHASH_SIZE_LENGTH = 1,
  PEER_ID_LENGTH = 20
}

export enum MessageFlags {
  Choke = 0,
  Unchoke = 1,
  Interested = 2,
  NotInterested = 3,
  Have = 4,
  Bitfield = 5,
  Request = 6,
  Piece = 7,
  Cancel = 8,
  Extended = 20
}
