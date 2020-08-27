import { TypedEmitter } from 'tiny-typed-emitter';
export class ParseRequest {
  constructor(public readonly parserSize: number, public readonly parserName: string, public readonly callback: (buf: Buffer) => void) {}
}

interface ParserQueueEvents {
  new: (request: ParseRequest) => void;
}

export class StreamProcessor {
  private readonly parserQueue: Array<ParseRequest> = [];
  private _currentElement: ParseRequest | undefined;

  public push = (request: ParseRequest): ParseRequest => {
    this.parserQueue.push(request);

    const topElement = this.parserQueue.shift();
    if (!topElement) {
      throw new Error('Top element cant be empty, we just added one.');
    }

    return request;
  };

  public;
}
