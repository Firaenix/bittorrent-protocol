import Wire from '../src/Wire';
import { Extension, ExtendedHandshake, HandshakeExtensions } from '../src/Extension';
import bencode from 'bencode';
import { ExtensionExtraFields } from '../src/models/IExtension';
import * as bsv from 'bsv';

const merchant = new Wire('merchant');
const hungry = new Wire('hungry');

interface BIP270Handshake extends ExtensionExtraFields {
  pubKey: Buffer;
  output: Buffer;
}

class HodgeExtension extends Extension {
  public name = 'hodge';
  public requirePeer = false;
  public extraFields = {
    ['GULLA GULLA GULLA']: Buffer.from('Aw yeah')
  };

  public onHandshake = (infoHash: string, peerId: string, extensions: HandshakeExtensions) => {
    // console.log(this.wire.wireName, 'NewExtension incoming', infoHash, peerId, extensions);
  };

  public onExtendedHandshake = (handshake: ExtendedHandshake) => {};

  public onMessage = (buf: Buffer) => {};
}

class BitcoinExtension extends Extension {
  public name = 'bitcoin';
  public requirePeer = true;
  public extraFields: BIP270Handshake;

  constructor(wire: Wire, pubKey: any) {
    super(wire);

    this.extraFields = {
      pubKey: Buffer.from(pubKey),
      output: Buffer.from('278364872364827346782637487234623874267834672783423')
    };
  }

  public onHandshake = (infoHash: string, peerId: string, extensions: HandshakeExtensions) => {
    // console.log(this.wire.wireName, 'NewExtension incoming', infoHash, peerId, extensions);
  };

  public onExtendedHandshake = (handshake: ExtendedHandshake) => {
    const peerBitcoinParams = handshake.exts['bitcoin'] as BIP270Handshake;

    console.log(this.wire.wireName, handshake.exts['hodge'], handshake.exts['hodge']?.['GULLA GULLA GULLA']?.toString());

    console.log(this.wire.wireName, 'Peer public key', peerBitcoinParams.pubKey, 'Output', peerBitcoinParams.output);
  };

  public onMessage = (buf: Buffer) => {
    console.log(this.wire.wireName, 'NewExtension incoming', bencode.decode(buf));
  };
}

hungry.pipe(merchant).pipe(hungry);

hungry.use((wire: Wire) => {
  const privateKey = bsv.PrivateKey.fromRandom();
  return new BitcoinExtension(wire, bsv.PublicKey.fromPrivateKey(privateKey).toHex());
});
hungry.use((w) => new HodgeExtension(w));

merchant.use((w) => {
  const privateKey = bsv.PrivateKey.fromRandom();
  return new BitcoinExtension(w, bsv.PublicKey.fromPrivateKey(privateKey).toHex());
});

merchant.on('handshake', (...data: unknown[]) => {
  console.log('2 {incomingWire} Incoming handshake from ', data);
  merchant.handshake('4444444444444444444430313233343536373839', '4444444444444444444430313233343536373839');
});

hungry.on('handshake', (...data: unknown[]) => {
  console.log('3 {outgoingWire} Incoming handshake', data);
  console.log('3a unchoke my nigga');
  hungry.unchoke();
});

merchant.on('extended', (...data: unknown[]) => {
  console.log('4 {incomingWire} Incoming extended handshake from ', data);
});

hungry.on('extended', (...data: unknown[]) => {
  console.log('5 {outgoingWire} Incoming extended handshake', data);
  hungry.unchoke();
  merchant.unchoke();

  setTimeout(() => {
    hungry.request(0, 0, 11, (err) => {
      console.error('Request error', err);
    });
  }, 1000);
});

merchant.on('request', (...args: any[]) => {
  console.log('Peer requested data', args);
});

merchant.once('interested', () => {
  console.log('Outgoing wire is interested, unchoke');
  merchant.unchoke();
});

console.log('1');
hungry.handshake('3031323334353637383930313233343536373839', '3132333435363738393031323334353637383930');
