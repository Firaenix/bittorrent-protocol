import Wire from '../src/Wire';
import { Extension, ExtendedHandshake, HandshakeExtensions } from '../src/Extension';
import bencode from 'bencode';

const incomingWire = new Wire('incomingWire');
const outgoingWire = new Wire('outgoingWire');

class NewExtension extends Extension {
  public name = 'new_extension';
  public requirePeer = true;

  public onHandshake = (infoHash: string, peerId: string, extensions: HandshakeExtensions) => {
    // console.log(this.wire.wireName, 'NewExtension incoming', infoHash, peerId, extensions);
  };

  public onExtendedHandshake = (handshake: ExtendedHandshake) => {
    // console.log(this.wire.wireName, 'NewExtension Extended Handshake incoming', handshake);
  };

  public onMessage = (buf: Buffer) => {
    console.log(this.wire.wireName, 'NewExtension incoming', bencode.decode(buf));
  };
}

outgoingWire.pipe(incomingWire).pipe(outgoingWire);
outgoingWire.use(NewExtension);
incomingWire.use(NewExtension);

incomingWire.on('handshake', (...data: unknown[]) => {
  console.log('2 {incomingWire} Incoming handshake from ', data);
  incomingWire.handshake('4444444444444444444430313233343536373839', '4444444444444444444430313233343536373839');
});

outgoingWire.on('handshake', (...data: unknown[]) => {
  console.log('3 {outgoingWire} Incoming handshake', data);
});

incomingWire.on('extended', (...data: unknown[]) => {
  console.log('4 {incomingWire} Incoming extended handshake from ', data);
});

outgoingWire.on('extended', (...data: unknown[]) => {
  console.log('5 {outgoingWire} Incoming extended handshake', data);
});

incomingWire.on('request', (...args: any[]) => {
  console.log('Peer requested data', args);
});

incomingWire.once('interested', () => {
  console.log('Outgoing wire is interested, unchoke');
  incomingWire.unchoke();
});

console.log('1');
outgoingWire.handshake('3031323334353637383930313233343536373839', '3132333435363738393031323334353637383930');
