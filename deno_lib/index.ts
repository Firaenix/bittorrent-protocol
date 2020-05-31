import * as Wire from './Wire.ts';
import * as Extension from './Extension.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).Extension = Extension.Extension;
module.exports.Extension = Extension.Extension;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).Wire = Wire.default;
module.exports = Wire.default;
