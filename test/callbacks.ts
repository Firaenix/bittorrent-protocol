import { Wire } from '../src/Wire';
import test from 'tape';

test('recieve callback when request for piece resolves', { timeout: 5000 }, (t) => {
  t.plan(2);

  const wire1 = new Wire();
  const wire2 = new Wire();
  wire1.pipe(wire2).pipe(wire1);
  const pieceBuf = Buffer.from('Please');

  wire1.on('piece', () => {
    console.log('wire 1 got piece');
  });

  wire2.on('request', () => {
    console.log('wire 2 got request');
    // Send data
    wire2.piece(0, 0, pieceBuf);
  });

  wire1.on('unchoke', () => {
    wire1.request(0, 0, pieceBuf.length, (err, buf) => {
      t.notok(err);
      t.ok(buf);
    });
  });

  wire1.on('extended', () => {
    // wire1.unchoke();
    console.log('wire 1 extended');

    // wire1.handshake(Buffer.from('asdkjashdjkasd'), Buffer.from('10101010101010111001'));
  });

  wire2.on('extended', () => {
    wire2.unchoke();
    console.log('wire 2 extended');
  });

  wire2.on('handshake', () => {
    wire2.handshake(Buffer.from('asdkjashdjkasd'), Buffer.from('10101010101010111001'));
  });

  wire1.handshake(Buffer.from('asdkjashdjkasd'), Buffer.from('10101010101010111001'));
});
