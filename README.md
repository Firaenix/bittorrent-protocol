# bittorrent-protocol ![tests](https://github.com/Firaenix/bittorrent-protocol/workflows/Test-And-Publish/badge.svg) ![Linter](https://github.com/Firaenix/bittorrent-protocol/workflows/Linter/badge.svg)

### Simple, robust, BitTorrent wire protocol implementation

Node.js implementation of the [BitTorrent peer wire protocol](https://wiki.theory.org/BitTorrentSpecification#Peer_wire_protocol_.28TCP.29). The protocol is the main communication layer for BitTorrent file transfer.

## Changes made

- Converted to typescript
- Allow optional termination of stream if remote peer does not have the same extension
- Ensure full handshake + extended handshake happens before allowing data to be requested.
- BEP10 extensions are now much more powerful, allowing extensions to hook into the bittorrent protocol as messages are passed around. Check IExtension for details on the methods added. (BEP10e)

## TODO

- Allow metainfo files and magnet links to specify the hashing algorithm used for an infohash.
- (Maybe) Satisfy ![BEP30](http://bittorrent.org/beps/bep_0030.html) and allow Merkel hashes instead of pieces in a torrent file.
- Torrent Signing ![BEP35](http://bittorrent.org/beps/bep_0035.html)
- Mutable Torrents via URL (![BEP39](http://bittorrent.org/beps/bep_0039.html)) or DHT (![BEP46](http://bittorrent.org/beps/bep_0046.html))

## install

```
npm install @firaenix/bittorrent-protocol
```

## usage

The protocol is implemented as a **duplex stream**, so all you have to do is pipe to and from it.

| duplex streams | a.pipe(b).pipe(a) |
| --- | --- |
| ![duplex streams](https://raw.github.com/substack/lxjs-stream-examples/master/images/duplex_streams.png) | ![a.pipe(b).pipe(a)](https://raw.github.com/substack/lxjs-stream-examples/master/images/a_pipe_b_pipe_a.png) |

(Images from the ["harnessing streams"](https://github.com/substack/lxjs-stream-examples/blob/master/slides.markdown) talk by substack.)

```js
const Protocol = require('bittorrent-protocol');
const net = require('net');

net
  .createServer((socket) => {
    const wire = new Protocol();

    // pipe to and from the protocol
    socket.pipe(wire).pipe(socket);

    wire.on('handshake', (infoHash, peerId) => {
      // receive a handshake (infoHash and peerId are hex strings)

      // lets emit a handshake of our own as well
      wire.handshake('my info hash (hex)', 'my peer id (hex)');
    });

    wire.on('unchoke', () => {
      console.log('peer is no longer choking us: ' + wire.peerChoking);
    });
  })
  .listen(6881);
```

## methods

### handshaking

Send and receive a handshake from the peer. This is the first message.

```js
// send a handshake to the peer
wire.handshake(infoHash, peerId, { dht: true });
wire.on('handshake', (infoHash, peerId, extensions) => {
  // receive a handshake (infoHash and peerId are hex strings)
  console.log(extensions.dht); // supports DHT (BEP-0005)
  console.log(extensions.extended); // supports extension protocol (BEP-0010)
});
```

For `wire.handshake()`, the `infoHash` and the `peerId` should be 20 bytes (hex-encoded `string` or `Buffer`).

### choking

Check if you or the peer is choking.

```js
wire.peerChoking; // is the peer choking us?
wire.amChoking; // are we choking the peer?

wire.on('choke', () => {
  // the peer is now choking us
});
wire.on('unchoke', () => {
  // peer is no longer choking us
});
```

### interested

See if you or the peer is interested.

```js
wire.peerInterested; // is the peer interested in us?
wire.amInterested; // are we interested in the peer?

wire.on('interested', () => {
  // peer is now interested
});
wire.on('uninterested', () => {
  // peer is no longer interested
});
```

### bitfield

Exchange piece information with the peer.

```js
// send a bitfield to the peer
wire.bitfield(buffer);
wire.on('bitfield', (bitfield) => {
  // bitfield received from the peer
});

// send a have message indicating that you have a piece
wire.have(pieceIndex);
wire.on('have', (pieceIndex) => {
  // peer has sent you a have message
});
```

You can always see which pieces the peer has

```js
wire.peerPieces.get(i); // returns true if peer has piece i
```

`wire.peerPieces` is a `BitField`, see [docs](https://www.npmjs.org/package/bitfield).

### requests

Send and respond to requests for pieces.

```js
// request a block from a peer
wire.request(pieceIndex, offset, length, (err, block) => {
  if (err) {
    // there was an error (peer has started choking us etc)
    return;
  }
  // got block
});

// cancel a request to a peer
wire.cancel(pieceIndex, offset, length);

// receive a request from a peer
wire.on('request', (pieceIndex, offset, length, callback) => {
  // ... read block ...
  callback(null, block); // respond back to the peer
});

wire.requests; // list of requests we currently have pending {piece, offset, length}
wire.peerRequests; // list of requests the peer currently have pending {piece, offset, length}
```

You can set a request timeout if you want to.

```js
wire.setTimeout(5000); // head request should take a most 5s to finish
```

If the timeout is triggered the request callback is called with an error and a `timeout` event is emitted.

### dht and port

You can set the extensions flag `dht` in the handshake to `true` if you participate in the torrent dht. Afterwards you can send your dht port.

```js
// send your port to the peer
wire.port(dhtPort);
wire.on('port', (dhtPort) => {
  // peer has sent a port to us
});
```

You can check to see if the peer supports extensions.

```js
wire.peerExtensions.dht; // supports DHT (bep_0005)
wire.peerExtensions.extended; // supports extended messages (bep_0005)
```

### keep-alive

You can enable the keep-alive ping (triggered every 60s).

```js
// starts the keep alive
wire.setKeepAlive(true);
wire.on('keep-alive', () => {
  // peer sent a keep alive - just ignore it
});
```

### extension protocol (BEP 10)

This module has built-in support for the [BitTorrent Extension Protocol (BEP 10)](http://www.bittorrent.org/beps/bep_0010.html).

The intention of BEP 10 is to provide a simple and thin transport for extensions to the bittorrent protocol. Most extensions to the protocol use BEP 10 so they can add new features to the protocol without interfering with the standard bittorrent protocol or clients that don't support the new extension.

An example of a BitTorrent extension that uses BEP 10 is [ut_metadata](http://www.bittorrent.org/beps/bep_0009.html) (BEP 9), the extension that allows magnet uris to work.

```js
wire.extended(code, buffer);
```

This package, **bittorrent-protocol**, also provides an extension API to make it easy to add extensions to this module using the "extension protocol" (BEP 10). For example, to support ut_metadata (BEP 9), you need only install the [ut_metadata](https://www.npmjs.com/package/ut_metadata) npm module and call `wire.use()`. See the [Extension API](#extension-api) section for more information.

### transfer stats

Check how many bytes you have uploaded and download, and current speed

```js
wire.uploaded // number of bytes uploaded
wire.downloaded // number of bytes downloaded

wire.uploadSpeed() // upload speed - bytes per second
wire.downloadSpeed() // download speed - bytes per second

wire.on('download', numberOfBytes => {
  ...
})
wire.on('upload', numberOfBytes => {
  ...
})
```

## extension api

This package supports a simple extension API so you can extend the default protocol functionality with common protocol extensions like ut_metadata (magnet uris).

Here are the **bittorrent-protocol** extensions that we know about:

- [ut_metadata](https://www.npmjs.com/package/ut_metadata) - Extension for Peers to Send Metadata Files (BEP 9)
- [ut_pex](https://www.npmjs.com/package/ut_pex) - Extension for Peer Discovery (PEX)
- _Add yours here! Send a pull request!_

In short, an extension can register itself with at a certain name, which will be added to the extended protocol handshake sent to the remote peer. Extensions can also hook events like 'handshake' and 'extended'. To use an extension, simply require it and call `wire.use()`.

Here is an example of the **ut_metadata** extension being used with **bittorrent-protocol**:

```js
const Protocol = require('bittorrent-protocol');
const net = require('net');
const ut_metadata = require('ut_metadata');

net
  .createServer((socket) => {
    const wire = new Protocol();
    socket.pipe(wire).pipe(socket);

    // initialize the extension
    wire.use(ut_metadata());

    // all `ut_metadata` functionality can now be accessed at wire.ut_metadata

    // ask the peer to send us metadata
    wire.ut_metadata.fetch();

    // 'metadata' event will fire when the metadata arrives and is verified to be correct!
    wire.ut_metadata.on('metadata', (metadata) => {
      // got metadata!
      // Note: the event will not fire if the peer does not support ut_metadata, if they
      // don't have metadata yet either, if they repeatedly send invalid data, or if they
      // simply don't respond.
    });

    // optionally, listen to the 'warning' event if you want to know that metadata is
    // probably not going to arrive for one of the above reasons.
    wire.ut_metadata.on('warning', (err) => {
      console.log(err.message);
    });

    // handle handshake
    wire.on('handshake', (infoHash, peerId) => {
      // receive a handshake (infoHash and peerId are hex strings)
      wire.handshake(new Buffer('my info hash'), new Buffer('my peer id'));
    });
  })
  .listen(6881);
```

If you want to write your own extension, take a look at the [ut_metadata index.js file](https://github.com/webtorrent/ut_metadata/blob/master/index.js) to see how it's done.

## license

MIT. Copyright (c) [Feross Aboukhadijeh](https://feross.org), Mathias Buus, and [WebTorrent, LLC](https://webtorrent.io).

## Some ideas

```
{
  "announce": [], // the URL of the tracker
  "info": { // this maps to a dictionary whose keys are dependent on whether one or more files are being shared:
    "files": [{ // a list of dictionaries each corresponding to a file (only when multiple files are being shared). Each dictionary has the following keys:
      "length": 0, // size of the file in bytes.
      "path": "./path/to/file" // a list of strings corresponding to subdirectory names, the last of which is the actual file name
    }],
    "length": 10, // size of the file in bytes (only when one file is being shared)
    "name": "example_torrent.zip", // suggested filename where the file is to be saved (if one file)/suggested directory name where the files are to be saved (if multiple files)
    "piece length": 28, // number of bytes per piece. This is commonly 28 KiB = 256 KiB = 262,144 B.
    "pieces": ["piecehash"], // a hash list, i.e., a concatenation of each piece's SHA-1 hash. As SHA-1 returns a 160-bit hash, pieces will be a string whose length is a multiple of 20 bytes. If the torrent contains multiple files, the pieces are formed by concatenating the files in the order they appear in the files dictionary (i.e. all pieces in the torrent are the full piece length except for the last piece, which may be shorter).
    "nodes": [["<host>", "port"], ["<host>", "port"]], // The specification recommends that nodes "should be set to the K closest nodes in the torrent generating client's routing table. Alternatively, the key could be set to a known good node such as one operated by the person generating the torrent."
    "root hash": "<binary {{ROOT_HASH_ALGO}} hash>", // A torrent file using Merkle trees does not have a pieces key in the info list. Instead, such a torrent file has a root_hash key in the info list. This key's value is the root hash of the Merkle hash.
    "root hash algo": "BLAKE3" // PROPOSAL: Specify the algorithm used for the root hash
  },
  "infoHashSig": "", // PROPOSAL: Signature tied to the hash of the info field
  "infoHashSigAlgo": "ECDSA" // PROPOSAL: Allow the specification of custom signature algorithms
}
```
