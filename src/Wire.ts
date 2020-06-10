import arrayRemove from 'unordered-array-remove';
import bencode from 'bencode';
import BitField, { BitFieldData } from 'bitfield';
import debugNs from 'debug';
import randombytes from 'randombytes';
import speedometer from 'speedometer';
import stream from 'readable-stream';
import { ExtendedHandshake } from './Extension';
import { MessageBuffers, MessageFlags } from './models/PeerMessages';
import { IExtension } from './models/IExtension';
import { PieceRequest } from './models/PieceRequest';

const debug = debugNs('firaenix-bittorrent-protocol');

const BITFIELD_GROW = 400000;
const KEEP_ALIVE_TIMEOUT = 55000;

export type ExtensionsMap = { [x: string]: boolean; dht: boolean; extended: boolean };

export default class Wire extends stream.Duplex {
  public _debugId: string;
  public peerId: string | undefined;
  public peerIdBuffer: Buffer | undefined;
  public type: 'webrtc' | 'tcpIncoming' | 'tcpOutgoing' | 'webSeed' | null;
  public amChoking: boolean;
  public amInterested: boolean;
  public peerChoking: boolean;
  public peerInterested: boolean;
  public peerPieces: BitField;
  public peerExtensions: ExtensionsMap;
  public requests: PieceRequest[];
  public peerRequests: PieceRequest[];

  public extendedMapping: { [key: number]: string };
  public peerExtendedMapping: { [key: string]: number };
  public extendedHandshake: ExtendedHandshake;
  public peerExtendedHandshake: ExtendedHandshake;
  public _ext: { [extensionName: string]: IExtension };
  public _nextExt: number;

  public uploaded: number;
  public downloaded: number;
  public uploadSpeed: (speed: number) => void;
  public downloadSpeed: (speed: number) => void;

  public _keepAliveInterval: number | NodeJS.Timeout | undefined;
  public _timeout: number | NodeJS.Timeout | undefined;
  public _timeoutMs: number;
  public destroyed: boolean;
  public _finished: unknown;
  public _parserSize: number;
  public _parser: ((buf: Buffer) => unknown) | null;
  public _buffer: Buffer[];
  public _bufferSize: number;
  public _timeoutUnref: unknown;
  public _handshakeSent: boolean;
  public _extendedHandshakeSent: boolean;
  public _handshakeSuccess = false;
  public _extendedHandshakeSuccess = false;
  public wireName: string | undefined;

  constructor(name?: string) {
    super();
    this.wireName = name;

    this._debugId = randombytes(4).toString('hex');
    this._debug('new wire');

    this.peerId = undefined; // remote peer id (hex string)
    this.peerIdBuffer = undefined; // remote peer id (buffer)
    this.type = null; // connection type ('webrtc', 'tcpIncoming', 'tcpOutgoing', 'webSeed')

    this.amChoking = true; // are we choking the peer?
    this.amInterested = false; // are we interested in the peer?

    this.peerChoking = true; // is the peer choking us?
    this.peerInterested = false; // is the peer interested in us?

    // The largest torrent that I know of (the Geocities archive) is ~641 GB and has
    // ~41,000 pieces. Therefore, cap bitfield to 10x larger (400,000 bits) to support all
    // possible torrents but prevent malicious peers from growing bitfield to fill memory.
    this.peerPieces = new BitField(0, { grow: BITFIELD_GROW });

    this.peerExtensions = { dht: false, extended: false };

    this.requests = []; // outgoing
    this.peerRequests = []; // incoming

    this.extendedMapping = {}; // number -> string, ex: 1 -> 'ut_metadata'
    this.peerExtendedMapping = {}; // string -> number, ex: 9 -> 'ut_metadata'

    // The extended handshake to send, minus the "m" field, which gets automatically
    // filled from `this.extendedMapping`
    this.extendedHandshake = { m: {}, exts: {} };

    this.peerExtendedHandshake = { m: {}, exts: {} }; // remote peer's extended handshake

    this._ext = {}; // string -> function, ex 'ut_metadata' -> ut_metadata()
    this._nextExt = 1;

    this.uploaded = 0;
    this.downloaded = 0;
    this.uploadSpeed = speedometer();
    this.downloadSpeed = speedometer();

    this._keepAliveInterval = undefined;
    this._timeout = undefined;
    this._timeoutMs = 0;

    this.destroyed = false; // was the wire ended by calling `destroy`?
    this._finished = false;

    this._parserSize = 0; // number of needed bytes to parse next message from remote peer
    this._parser = null; // function to call once `this._parserSize` bytes are available

    this._buffer = []; // incomplete message data
    this._bufferSize = 0; // cached total length of buffers in `this._buffer`

    this.once('finish', () => this._onFinish());

    this._parseHandshake();
  }

  /**
   * Set whether to send a "keep-alive" ping (sent every 55s)
   * @param {boolean} enable
   */
  public setKeepAlive(enable: boolean): void {
    this._debug('setKeepAlive %s', enable);
    clearInterval(this._keepAliveInterval as number);
    if (enable === false) return;
    this._keepAliveInterval = setInterval(() => {
      this.keepAlive();
    }, KEEP_ALIVE_TIMEOUT);
  }

  /**
   * Set the amount of time to wait before considering a request to be "timed out"
   * @param {number} ms
   * @param {boolean=} unref (should the timer be unref'd? default: false)
   */
  public setTimeout(ms: number, unref?: boolean): void {
    this._debug('setTimeout ms=%d unref=%s', ms, unref);
    this._clearTimeout();
    this._timeoutMs = ms;
    this._timeoutUnref = !!unref;
    this._updateTimeout();
  }

  public destroy() {
    if (this.destroyed) {
      return this;
    }

    this.destroyed = true;
    this._debug('destroy');
    this.emit('close');
    this.end();
    return this;
  }

  public end(...args: any[]): void {
    this._debug('end');
    this._onUninterested();
    this._onChoke();
    super.end(...args);
  }

  /**
   * Use the specified protocol extension.
   * @param  {function} Extension
   */
  public use(newExtension: (wire: Wire) => IExtension): void {
    const ext = this._nextExt;
    const handler = newExtension(this);

    const name = handler.name;
    if (!name) {
      throw new Error('Extension class requires a "name" property');
    }

    this._debug('use extension.name=%s', name);

    // eslint-disable-next-line @typescript-eslint/no-empty-function
    function noop(): void {}

    if (typeof handler.onHandshake !== 'function') {
      handler.onHandshake = noop;
    }
    if (typeof handler.onExtendedHandshake !== 'function') {
      handler.onExtendedHandshake = noop;
    }
    if (typeof handler.onMessage !== 'function') {
      handler.onMessage = noop;
    }

    this.extendedMapping[ext] = name;
    this._ext[name] = handler;
    this[name] = handler;

    this._nextExt += 1;
  }

  //
  // OUTGOING MESSAGES
  //

  /**
   * Message "keep-alive": <len=0000>
   */
  public keepAlive() {
    this._debug('keep-alive');
    this._push(MessageBuffers.MESSAGE_KEEP_ALIVE);
  }

  /**
   * Message: "handshake" <pstrlen><pstr><reserved><info_hash><peer_id>
   * @param  {Buffer|string} infoHash (as Buffer or *hex* string)
   * @param  {Buffer|string} peerId
   * @param  {Object} extensions
   */
  public handshake(infoHash: Buffer | string, peerId: Buffer | string, extensions?: any) {
    let infoHashBuffer;
    let peerIdBuffer;
    if (typeof infoHash === 'string') {
      infoHash = infoHash.toLowerCase();
      infoHashBuffer = Buffer.from(infoHash, 'hex');
    } else {
      infoHashBuffer = infoHash;
      infoHash = infoHashBuffer.toString('hex');
    }
    if (typeof peerId === 'string') {
      peerIdBuffer = Buffer.from(peerId, 'hex');
    } else {
      peerIdBuffer = peerId;
      peerId = peerIdBuffer.toString('hex');
    }

    if (infoHashBuffer.length !== 20 || peerIdBuffer.length !== 20) {
      throw new Error('infoHash and peerId MUST have length 20');
    }

    this._debug('handshake i=%s p=%s exts=%o', infoHash, peerId, extensions);

    const reserved = Buffer.from(MessageBuffers.MESSAGE_RESERVED);

    // enable extended message
    reserved[5] |= 0x10;

    if (extensions && extensions.dht) reserved[7] |= 1;

    this._push(Buffer.concat([MessageBuffers.MESSAGE_PROTOCOL, reserved, infoHashBuffer, peerIdBuffer]));
    this._handshakeSent = true;

    if (this.peerExtensions.extended && !this._extendedHandshakeSent) {
      // Peer's handshake indicated support already
      // (incoming connection)
      this._sendExtendedHandshake();
    }
  }

  /* Peer supports BEP-0010, send extended handshake.
   *
   * This comes after the 'handshake' event to give the user a chance to populate
   * `this.extendedHandshake` and `this.extendedMapping` before the extended handshake
   * is sent to the remote peer.
   */
  private _sendExtendedHandshake() {
    // Create extended message object from registered extensions
    type HandshakeMessage = {
      m: { [extName: string]: number };
      exts: {
        [extName: string]: {
          [key: string]: Buffer;
        };
      };
    };

    const msg: HandshakeMessage = {
      ...Object.assign({}, this.extendedHandshake),
      m: {},
      exts: {}
    };

    for (const ext in this.extendedMapping) {
      const name = this.extendedMapping[ext];
      const extension = this._ext[name];
      msg.m[name] = Number(ext);
      msg.exts[name] = {
        ...extension.extraFields
      };
    }

    // Send extended handshake
    this.extended(0, bencode.encode(msg));
    this._extendedHandshakeSent = true;
  }

  /**
   * Message "choke": <len=0001><id=0>
   */
  public choke() {
    if (this.amChoking) return;
    this.amChoking = true;
    this._debug('choke');
    while (this.peerRequests.length) {
      this.peerRequests.pop();
    }
    this._push(MessageBuffers.MESSAGE_CHOKE);
  }

  /**
   * Message "unchoke": <len=0001><id=1>
   */
  public unchoke() {
    if (!this.amChoking) return;
    this.amChoking = false;
    this._debug('unchoke');
    this._push(MessageBuffers.MESSAGE_UNCHOKE);
  }

  /**
   * Message "interested": <len=0001><id=2>
   */
  public interested() {
    if (this.amInterested) return;
    this.amInterested = true;
    this._debug('interested');
    this._push(MessageBuffers.MESSAGE_INTERESTED);
  }

  /**
   * Message "uninterested": <len=0001><id=3>
   */
  public uninterested() {
    if (!this.amInterested) return;
    this.amInterested = false;
    this._debug('uninterested');
    this._push(MessageBuffers.MESSAGE_UNINTERESTED);
  }

  /**
   * Message "have": <len=0005><id=4><piece index>
   * @param  {number} index
   */
  public have(index: number) {
    this._debug('have %d', index);
    this._message(4, [index], null);
  }

  /**
   * Message "bitfield": <len=0001+X><id=5><bitfield>
   * @param  {BitField|Buffer} bitfield
   */
  public bitfield(bitfield: BitField | Buffer) {
    this._debug('bitfield');
    if (!Buffer.isBuffer(bitfield)) bitfield = bitfield.buffer;
    this._message(5, [], bitfield);
  }

  /**
   * Message "request": <len=0013><id=6><index><begin><length>
   * @param  {number}   index
   * @param  {number}   offset
   * @param  {number}   length
   * @param  {function} cb
   */
  public request(index: number, offset: number, length: number, cb: Function) {
    if (!cb) cb = () => {};
    if (this._finished) {
      return cb(new Error('wire is closed'));
    }
    if (this.peerChoking) {
      return cb(new Error('peer is choking'));
    }
    if (this._handshakeSuccess === false) {
      return cb(new Error(`peer hasn't finished handshaking`));
    }
    if (this._nextExt > 1 && this._extendedHandshakeSuccess === false) {
      return cb(new Error(`peer hasn't finished extended handshaking`));
    }

    this._debug('request index=%d offset=%d length=%d', index, offset, length);

    this.requests.push(new PieceRequest(index, offset, length, cb));
    this._updateTimeout();
    this._message(6, [index, offset, length], null);
  }

  /**
   * Message "piece": <len=0009+X><id=7><index><begin><block>
   * @param  {number} index
   * @param  {number} offset
   * @param  {Buffer} buffer
   */
  public piece(index: number, offset: number, buffer: Buffer) {
    this._debug('piece index=%d offset=%d', index, offset);
    this.uploaded += buffer.length;
    this.uploadSpeed(buffer.length);
    this.emit('upload', buffer.length);
    this._message(7, [index, offset], buffer);
  }

  /**
   * Message "cancel": <len=0013><id=8><index><begin><length>
   * @param  {number} index
   * @param  {number} offset
   * @param  {number} length
   */
  public cancel(index: number, offset: number, length: number) {
    this._debug('cancel index=%d offset=%d length=%d', index, offset, length);
    this._callback(this._pull(this.requests, index, offset, length), new Error('request was cancelled'), null);
    this._message(8, [index, offset, length], null);
  }

  /**
   * Message: "port" <len=0003><id=9><listen-port>
   * @param {Number} port
   */
  public port(port: number) {
    this._debug('port %d', port);
    const message = Buffer.from(MessageBuffers.MESSAGE_PORT);
    message.writeUInt16BE(port, 5);
    this._push(message);
  }

  /**
   * Message: "extended" <len=0005+X><id=20><ext-number><payload>
   * @param  {number|string} ext
   * @param  {Object} obj
   */
  public extended(ext: number | string, obj: object) {
    this._debug('extended ext=%s', ext);
    if (typeof ext === 'string' && this.peerExtendedMapping[ext]) {
      ext = this.peerExtendedMapping[ext];
    }
    if (typeof ext === 'number') {
      const extId = Buffer.from([ext]);
      const buf = Buffer.isBuffer(obj) ? obj : bencode.encode(obj);

      this._message(20, [], Buffer.concat([extId, buf]));
    } else {
      throw new Error(`Unrecognized extension: ${ext}`);
    }
  }

  /**
   * Duplex stream method. Called whenever the remote peer stream wants data. No-op
   * since we'll just push data whenever we get it.
   */
  _read() {}

  /**
   * Send a message to the remote peer.
   */
  private _message(id: number, numbers: number[], data: Buffer | null) {
    const dataLength = data ? data.length : 0;
    const buffer = Buffer.allocUnsafe(5 + 4 * numbers.length);

    buffer.writeUInt32BE(buffer.length + dataLength - 4, 0);
    buffer[4] = id;
    for (let i = 0; i < numbers.length; i++) {
      buffer.writeUInt32BE(numbers[i], 5 + 4 * i);
    }

    this._push(buffer);
    if (data) this._push(data);
  }

  private _push(data) {
    if (this._finished) return;
    return this.push(data);
  }

  //
  // INCOMING MESSAGES
  //

  private _onKeepAlive() {
    this._debug('got keep-alive');
    this.emit('keep-alive');
  }

  private _onHandshake(infoHashBuffer: Buffer, peerIdBuffer: Buffer, extensions: ExtensionsMap) {
    const infoHash = infoHashBuffer.toString('hex');
    const peerId = peerIdBuffer.toString('hex');

    this._debug('got handshake i=%s p=%s exts=%o', infoHash, peerId, extensions);

    this.peerId = peerId;
    this.peerIdBuffer = peerIdBuffer;
    this.peerExtensions = extensions;

    this.emit('handshake', infoHash, peerId, extensions);

    let name;
    for (name in this._ext) {
      this._ext[name].onHandshake(infoHash, peerId, extensions);
    }

    if (extensions.extended && this._handshakeSent && !this._extendedHandshakeSent) {
      // outgoing connection
      this._sendExtendedHandshake();
    }
    this._handshakeSuccess = true;
  }

  private async _onChoke() {
    this.peerChoking = true;
    this._debug('got choke');

    const extensionCalls = Object.values(this._ext)
      .filter((x) => x.onChoke)
      .map((x) => x.onChoke());
    await Promise.all(extensionCalls);

    this.emit('choke');
    while (this.requests.length) {
      this._callback(this.requests.pop(), new Error('peer is choking'), null);
    }
  }

  private async _onUnchoke() {
    this.peerChoking = false;
    this._debug('got unchoke');

    const extensionCalls = Object.values(this._ext)
      .filter((x) => x.onUnchoke)
      .map((x) => x.onUnchoke());
    await Promise.all(extensionCalls);
    this.emit('unchoke');
  }

  private async _onInterested() {
    this.peerInterested = true;
    this._debug('got interested');

    const extensionCalls = Object.values(this._ext)
      .filter((x) => x.onInterested)
      .map((x) => x.onInterested());
    await Promise.all(extensionCalls);

    this.emit('interested');
  }

  private async _onUninterested() {
    this.peerInterested = false;
    this._debug('got uninterested');

    const extensionCalls = Object.values(this._ext)
      .filter((x) => x.onUninterested)
      .map((x) => x.onUninterested());
    await Promise.all(extensionCalls);

    this.emit('uninterested');
  }

  private async _onHave(index: number) {
    if (this.peerPieces.get(index)) return;
    this._debug('got have %d', index);

    const extensionCalls = Object.values(this._ext)
      .filter((x) => x.onHave)
      .map((x) => x.onHave(index));
    await Promise.all(extensionCalls);

    this.peerPieces.set(index, true);
    this.emit('have', index);
  }

  private async _onBitField(buffer: BitFieldData) {
    this.peerPieces = new BitField(buffer);
    this._debug('got bitfield');

    const extensionCalls = Object.values(this._ext)
      .filter((x) => x.onBitField)
      .map((x) => x.onBitField(buffer));
    await Promise.all(extensionCalls);

    this.emit('bitfield', this.peerPieces);
  }

  private async _onRequest(index: number, offset: number, length: number): Promise<void> {
    if (this.amChoking) {
      return;
    }
    this._debug('got request index=%d offset=%d length=%d', index, offset, length);

    const extensionCalls = Object.values(this._ext)
      .filter((x) => x.onRequest)
      .map((x) => x.onRequest(index, offset, length));
    await Promise.all(extensionCalls);

    console.log('Extensions have resolved');

    const respond = (err, buffer) => {
      // below request var gets hoisted above this function.
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      if (request !== this._pull(this.peerRequests, index, offset, length)) return;
      if (err) return this._debug('error satisfying request index=%d offset=%d length=%d (%s)', index, offset, length, err.message);
      this.piece(index, offset, buffer);
    };

    // for some reason this field needs to be hoisted
    // eslint-disable-next-line no-var
    var request = new PieceRequest(index, offset, length, respond);
    this.peerRequests.push(request);
    this.emit('request', index, offset, length, respond);
  }

  private async _onPiece(index: number, offset: number, buffer: Buffer): Promise<void> {
    try {
      const extensionOnPieces = Object.values(this._ext)
        .filter((x) => x.onPiece)
        .map((x) => x.onPiece(index, offset, buffer));
      await Promise.all(extensionOnPieces);

      this._debug('got piece index=%d offset=%d', index, offset);
      this._callback(this._pull(this.requests, index, offset, buffer.length), null, buffer);
      this.downloaded += buffer.length;
      this.downloadSpeed(buffer.length);
      this.emit('download', buffer.length);
      this.emit('piece', index, offset, buffer);
    } catch (error) {
      console.error(error);
      this._debug('An error occurred when recieving a piece, destroying the connection', error);
      this.destroy();
    }
  }

  private async _onCancel(index: number, offset: number, length: number): Promise<void> {
    this._debug('got cancel index=%d offset=%d length=%d', index, offset, length);
    const extensionCalls = Object.values(this._ext)
      .filter((x) => x.onCancel)
      .map((x) => x.onCancel(index, offset, length));
    await Promise.all(extensionCalls);

    this._pull(this.peerRequests, index, offset, length);
    this.emit('cancel', index, offset, length);
  }

  private _onPort(port): void {
    this._debug('got port %d', port);
    this.emit('port', port);
  }

  private onExtendedMessage(extensionId: number, buf: Buffer) {
    if (!this.extendedMapping[extensionId]) {
      throw new Error(`Could not find extension with the given id: ${extensionId}`);
    }

    // get friendly name for extension
    const extensionName = this.extendedMapping[extensionId];
    if (!this._ext[extensionName]) {
      throw new Error(`Could not find extension with the given name: ${extensionName}`);
    }

    // there is an registered extension handler, so call it
    this._ext[extensionName].onMessage(buf);
    this._debug('got extended message ext=%s', extensionName);
    this.emit('extended', extensionName, buf);
  }

  private onExtendedHandshake(buf: Buffer) {
    let info: ExtendedHandshake | undefined;
    try {
      info = bencode.decode(buf);
    } catch (err) {
      this._debug('ignoring invalid extended handshake: %s', err.message || err);
      return;
    }

    if (!info) {
      return;
    }
    this.peerExtendedHandshake = info;

    // Find any extensions that require the other peer to have it too.
    for (const name in this._ext) {
      if (this._ext[name] && this._ext[name].requirePeer && !this.peerExtendedHandshake.m?.[name]) {
        this._debug('Destroying connection, peer doesnt have same extension.', name);
        this.destroy();
        this.emit('missing_extension', `Connected peer did not have the same extension: ${name}`);
        return;
      }
    }

    let name;
    if (typeof info.m === 'object') {
      for (name in info.m) {
        this.peerExtendedMapping[name] = Number(info.m[name].toString());
      }
    }
    for (name in this._ext) {
      if (this.peerExtendedMapping[name]) {
        this._ext[name].onExtendedHandshake(this.peerExtendedHandshake);
      }
    }
    this._debug('got extended handshake');
    this.emit('extended', 'handshake', this.peerExtendedHandshake);
    this._extendedHandshakeSuccess = true;
  }

  private _onExtended(extensionId: number, buf: Buffer) {
    // Which extension this message came from was not specified, this is a handshake
    if (extensionId === 0) {
      return this.onExtendedHandshake(buf);
    }

    return this.onExtendedMessage(extensionId, buf);
  }

  private _onTimeout() {
    this._debug('request timed out');
    this._callback(this.requests.shift(), new Error('request has timed out'), null);
    this.emit('timeout');
  }

  /**
   * Duplex stream method. Called whenever the remote peer has data for us. Data that the
   * remote peer sends gets buffered (i.e. not actually processed) until the right number
   * of bytes have arrived, determined by the last call to `this._parse(number, callback)`.
   * Once enough bytes have arrived to process the message, the callback function
   * (i.e. `this._parser`) gets called with the full buffer of data.
   * @param  {Buffer} data
   * @param  {string} encoding
   * @param  {function} cb
   */
  _write(data: Buffer, encoding: string, cb: (e: any) => void) {
    this._bufferSize += data.length;
    this._buffer.push(data);

    while (this._bufferSize >= this._parserSize) {
      const buffer = this._buffer.length === 1 ? this._buffer[0] : Buffer.concat(this._buffer);
      this._bufferSize -= this._parserSize;
      this._buffer = this._bufferSize ? [buffer.slice(this._parserSize)] : [];
      if (this._parser) {
        this._parser(buffer.slice(0, this._parserSize));
      }
    }

    cb(null); // Signal that we're ready for more data
  }

  private _callback(request: PieceRequest | null | undefined, err: Error | null | undefined, buffer: Buffer | null | undefined) {
    if (!request) return;

    this._clearTimeout();

    if (!this.peerChoking && !this._finished) this._updateTimeout();
    request.callback(err, buffer);
  }

  private _clearTimeout() {
    if (!this._timeout) return;

    clearTimeout(this._timeout as number);
    this._timeout = undefined;
  }

  private _updateTimeout() {
    if (!this._timeoutMs || !this.requests.length || this._timeout) return;

    this._timeout = setTimeout(() => this._onTimeout(), this._timeoutMs);
    if (this._timeoutUnref && this._timeout.unref) this._timeout.unref();
  }

  /**
   * Takes a number of bytes that the local peer is waiting to receive from the remote peer
   * in order to parse a complete message, and a callback function to be called once enough
   * bytes have arrived.
   * @param  {number} size
   * @param  {function} parser
   */
  private _parse(size: number, parser: (buf: Buffer) => unknown) {
    this._parserSize = size;
    this._parser = parser;
  }

  /**
   * Handle the first 4 bytes of a message, to determine the length of bytes that must be
   * waited for in order to have the whole message.
   * @param  {Buffer} buffer
   */
  private _onMessageLength(buffer: Buffer) {
    const length = buffer.readUInt32BE(0);
    if (length > 0) {
      this._parse(length, this._onMessage);
    } else {
      this._onKeepAlive();
      this._parse(4, this._onMessageLength);
    }
  }

  /**
   * Handle a message from the remote peer.
   * @param  {Buffer} buffer
   */
  private async _onMessage(buffer: Buffer) {
    this._parse(4, this._onMessageLength);
    const messageFlag: MessageFlags = buffer[0];

    switch (messageFlag) {
      case MessageFlags.Choke:
        return await this._onChoke();
      case MessageFlags.Unchoke:
        return await this._onUnchoke();
      case MessageFlags.Interested:
        return await this._onInterested();
      case MessageFlags.NotInterested:
        return await this._onUninterested();
      case MessageFlags.Have:
        return await this._onHave(buffer.readUInt32BE(1));
      case MessageFlags.Bitfield:
        return await this._onBitField(buffer.slice(1));
      case MessageFlags.Request:
        return await this._onRequest(buffer.readUInt32BE(1), buffer.readUInt32BE(5), buffer.readUInt32BE(9));
      case MessageFlags.Piece:
        return await this._onPiece(buffer.readUInt32BE(1), buffer.readUInt32BE(5), buffer.slice(9));
      case MessageFlags.Cancel:
        return await this._onCancel(buffer.readUInt32BE(1), buffer.readUInt32BE(5), buffer.readUInt32BE(9));
      case 9:
        return this._onPort(buffer.readUInt16BE(1));
      case MessageFlags.Extended:
        return this._onExtended(buffer.readUInt8(1), buffer.slice(2));
      default:
        this._debug('got unknown message');
        return this.emit('unknownmessage', buffer);
    }
  }

  private _parseHandshake() {
    this._parse(1, (buffer) => {
      const pstrlen = buffer.readUInt8(0);
      this._parse(pstrlen + 48, (handshake) => {
        const protocol = handshake.slice(0, pstrlen);

        if (protocol.toString() !== 'BitTorrent protocol') {
          this._debug('Error: wire not speaking BitTorrent protocol (%s)', protocol.toString());
          this.end();
          return;
        }
        handshake = handshake.slice(pstrlen);

        this._onHandshake(handshake.slice(8, 28), handshake.slice(28, 48), {
          dht: !!(handshake[7] & 0x01), // see bep_0005
          extended: !!(handshake[5] & 0x10) // see bep_0010
        });

        this._parse(4, this._onMessageLength);
      });
    });
  }

  private async _onFinish() {
    this._finished = true;

    const extensionCalls = Object.values(this._ext)
      .filter((x) => x.onFinish)
      .map((x) => x.onFinish());
    await Promise.all(extensionCalls);

    this.push(null); // stream cannot be half open, so signal the end of it
    while (this.read()) {} // consume and discard the rest of the stream data

    clearInterval(this._keepAliveInterval as number);
    this._parse(Number.MAX_VALUE, () => {});
    while (this.peerRequests.length) {
      this.peerRequests.pop();
    }
    while (this.requests.length) {
      this._callback(this.requests.pop(), new Error('wire was closed'), null);
    }
  }

  private _debug(...args: unknown[]) {
    debug(`[${Date.now()}][${this._debugId}]`, ...args);
  }

  private _pull(requests: PieceRequest[], pieceIdx: number, offset: number, length: number) {
    for (let i = 0; i < requests.length; i++) {
      const req = requests[i];
      if (req.piece === pieceIdx && req.offset === offset && req.length === length) {
        arrayRemove(requests, i);
        return req;
      }
    }
    return null;
  }
}
