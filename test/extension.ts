import Wire from '../src/Wire';
import test from 'tape';
import { Extension, HandshakeExtensions, ExtendedHandshake, EventExtension } from '../src/Extension';
import bencode from 'bencode';

test('Extension.prototype.name', (t) => {
  t.plan(2);

  const wire = new Wire();

  class NoNameExtension extends Extension {
    public name: string;
    public requirePeer = false;
    public onHandshake: (infoHash: string, peerId: string, extensions: HandshakeExtensions) => void;
    public onExtendedHandshake: (handshake: ExtendedHandshake) => void;
    public onMessage: (buf: Buffer) => void;
  }

  t.throws(() => {
    wire.use((w) => new NoNameExtension(w));
  }, 'throws when Extension.name is undefined');

  class NamedExtension extends Extension {
    public name = 'named_extension';
    public requirePeer = false;

    public onHandshake: (infoHash: string, peerId: string, extensions: HandshakeExtensions) => void;
    public onExtendedHandshake: (handshake: ExtendedHandshake) => void;
    public onMessage: (buf: Buffer) => void;
  }

  t.doesNotThrow(() => {
    wire.use((w) => new NamedExtension(w));
  }, 'does not throw when Extension.prototype.name is defined');
});

test('Extension.onHandshake', (t) => {
  t.plan(4);

  class TestExtension extends Extension {
    public name = 'test_extension';
    public requirePeer = false;

    public onHandshake = (infoHash: string, peerId: string): void => {
      t.equal(Buffer.from(infoHash, 'hex').length, 20);
      t.equal(Buffer.from(infoHash, 'hex').toString(), '01234567890123456789');
      t.equal(Buffer.from(peerId, 'hex').length, 20);
      t.equal(Buffer.from(peerId, 'hex').toString(), '12345678901234567890');
    };

    public onExtendedHandshake: (handshake: ExtendedHandshake) => void;
    public onMessage: (buf: Buffer) => void;
  }

  const wire = new Wire();

  wire.on('error', (err) => {
    t.fail(err.message);
  });
  wire.pipe(wire);

  wire.use((w) => new TestExtension(w));

  wire.handshake(Buffer.from('01234567890123456789'), Buffer.from('12345678901234567890'), undefined);
});

test('Extension.onExtendedHandshake', (t) => {
  t.plan(4);

  class TestExtension extends Extension {
    public name = 'test_extension';
    public requirePeer = undefined;
    public extraFields = {
      hello: Buffer.from('world!')
    };

    constructor(wire: Wire) {
      super(wire);
    }

    public onHandshake: (infoHash: string, peerId: string, extensions: HandshakeExtensions) => void;

    public onExtendedHandshake = (handshake: ExtendedHandshake): void => {
      t.ok(handshake.m, 'm field should be populated in Extended handshake');
      t.ok(handshake.m?.test_extension, 'peer extended handshake includes extension name');
      console.log(handshake);
      t.equal(handshake.exts['test_extension'].hello.toString(), 'world!', 'peer extended handshake includes extension-defined parameters');
    };

    public onMessage: (buf: Buffer) => void;
  }

  const wire = new Wire(); // incoming
  wire.on('error', (err) => {
    t.fail(err.message);
  });
  wire.pipe(wire);

  wire.once('handshake', (infoHash, peerId, extensions) => {
    console.log(extensions);
    t.equal(extensions.extended, true);
  });

  wire.use((w) => new TestExtension(w));

  wire.handshake('3031323334353637383930313233343536373839', '3132333435363738393031323334353637383930', undefined);
});

test('Wire destroyed on Extension with requirePeer true', (t) => {
  t.plan(2);

  class TestExtension extends Extension {
    public name = 'test_extension';
    public requirePeer = true;

    public onHandshake: (infoHash: string, peerId: string, extensions: HandshakeExtensions) => void;

    public onExtendedHandshake: (handshake: ExtendedHandshake) => void;

    public onMessage: (buf: Buffer) => void;
  }

  const incomingWire = new Wire('incomingWire');
  const outgoingWire = new Wire('outgoingWire');

  outgoingWire.pipe(incomingWire).pipe(outgoingWire);

  incomingWire.use((w) => new TestExtension(w));

  incomingWire.on('handshake', (...data: unknown[]) => {
    incomingWire.handshake('4444444444444444444430313233343536373839', '4444444444444444444430313233343536373839');
  });

  incomingWire.on('missing_extension', (reason: string) => {
    t.true(incomingWire.destroy);
    t.equals(reason, `test_extension`);
  });

  outgoingWire.handshake('3031323334353637383930313233343536373839', '3132333435363738393031323334353637383930');
});

test('Extension.onMessage', (t) => {
  t.plan(1);

  class TestExtension extends Extension {
    public name = 'test_extension';
    public requirePeer = false;

    public onMessage = (message: Buffer): void => {
      t.equal(message.toString(), 'hello world!', 'receives message sent with wire.extended()');
    };

    public onHandshake: (infoHash: string, peerId: string, extensions: HandshakeExtensions) => void;
    public onExtendedHandshake: (handshake: ExtendedHandshake) => void;
  }

  const wire = new Wire(); // outgoing
  wire.on('error', (err) => {
    t.fail(err.message);
  });
  wire.pipe(wire);

  wire.use((w) => new TestExtension(w));

  wire.handshake('3031323334353637383930313233343536373839', '3132333435363738393031323334353637383930', undefined);

  wire.once('extended_handshake', () => {
    wire.extended('test_extension', Buffer.from('hello world!'));
  });
});

test('Back and forth communication between wire extensions.', (t) => {
  t.plan(4);

  class TestExtension extends EventExtension<any> {
    public name = 'test_extension';
    public requirePeer = false;

    private pongCounter = 0;

    public onMessage = (message: any): void => {
      const decoded: Buffer[] = bencode.decode(message);
      const [flag, ...rest] = decoded;

      switch (flag.toString()) {
        case 'ping':
          return this.onPing();
        case 'pong':
          return this.onPong();
        default:
          t.fail('Extension recieved unknown message');
          return;
      }
    };

    public onRequest = async (index: number, offset: number, length: number): Promise<void> =>
      new Promise((resolve, reject) => {
        // Ping pong back and forth 3 times and then continu

        this.on('done', () => {
          resolve();
        });

        this.sendExtendedMessage(['ping']);
      });

    public onPing = () => {
      this.sendExtendedMessage(['pong']);
    };

    public onPong = () => {
      t.ok(true, 'got pong');
      this.emit('pong');

      this.pongCounter++;
      if (this.pongCounter >= 3) {
        // return resolve();
        this.emit('done');
        return;
      }

      this.sendExtendedMessage(['ping']);
    };

    public onHandshake: (infoHash: string, peerId: string, extensions: HandshakeExtensions) => void;
    public onExtendedHandshake: (handshake: ExtendedHandshake) => void;
  }

  const outWire = new Wire('outWire'); // outgoing
  const inWire = new Wire('inWire'); // outgoing
  outWire.on('error', (err) => {
    t.fail(err.message);
  });

  inWire.on('error', (err) => {
    t.fail(err.message);
  });

  outWire.pipe(inWire).pipe(outWire);

  outWire.use((w) => new TestExtension(w));
  inWire.use((w) => new TestExtension(w));

  outWire.on('request', (index, offset, length) => {
    outWire.piece(0, 0, Buffer.alloc(0));
  });

  (inWire as any).test_extension.on('done', () => {
    t.ok(true);
  });

  (outWire as any).test_extension.on('done', () => {
    t.ok(true);
  });

  outWire.once('unchoke', () => {
    outWire.request(0, 0, 0, (err, buf) => {
      if (err) {
        return t.fail(err.message);
      }

      t.ok(buf, 'We do get a buffer back');
    });
  });

  inWire.on('extended_handshake', () => {
    inWire.unchoke();
  });

  inWire.on('handshake', () => {
    inWire.handshake('3031323334353637383930313233343536373839', '3132333435363738393031323334353637383930');
  });

  outWire.handshake('3031323334353637383930313233343536373839', '3132333435363738393031323334353637383930', undefined);
});

test('Throws error when connection not finished handshake if piece requested', (t) => {
  t.plan(3);

  const wire = new Wire();
  wire.on('error', (err) => {
    t.fail(err.message);
  });
  wire.pipe(wire);
  wire.handshake(Buffer.from('01234567890123456789'), Buffer.from('12345678901234567890'));

  wire.on('unchoke', () => {
    wire.request(0, 0, 11, (err) => {
      t.error(err);
    });

    wire.request(0, 0, 11, (err) => {
      t.error(err);
    });

    wire.request(0, 0, 11, (err) => {
      t.error(err);
    });
  });

  wire.on('request', (i, offset, length, callback) => {
    callback(null, Buffer.from('hello world'));
  });

  // there should never be a timeout
  wire.on('timeout', () => {
    t.fail('Timed out');
  });

  wire.unchoke();
});
