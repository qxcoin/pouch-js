interface RecursiveParserResult {
  code: number,
  buffer: string,
}

class RecursiveParser {

  maxDepth: number = 20;
  delimiter: string = '\n';

  constructor (maxDepth: number, delimiter: string) {
    this.maxDepth = maxDepth;
    this.delimiter = delimiter;
  }

  parse(depth: number, buffer: string, callback: (msg: string, depth: number) => void): RecursiveParserResult {
    if (buffer.length === 0) {
      return { code: 0, buffer: buffer };
    }
    if (depth > this.maxDepth) {
      return { code: 1, buffer: buffer };
    }
    const xs = buffer.split(this.delimiter);
    if (xs.length === 1) {
      return { code: 0, buffer: buffer };
    }
    const msg = xs.shift();
    if (undefined !== msg) callback(msg, depth);
    return this.parse(depth + 1, xs.join(this.delimiter), callback);
  }
}

export class ElectrumMessageParser {

  buffer: string = '';
  callback: (msg: string, depth: number) => void = () => void(0);
  recursiveParser: RecursiveParser;

  constructor(callback: (msg: string, depth: number) => void) {
    this.buffer = '';
    this.callback = callback;
    this.recursiveParser = new RecursiveParser(20, '\n');
  }

  run(chunk: string) {
    this.buffer += chunk;
    while (true) {
      const res = this.recursiveParser.parse(0, this.buffer, this.callback);
      this.buffer = res.buffer;
      if (res.code === 0) {
        break;
      }
    }
  }
}
