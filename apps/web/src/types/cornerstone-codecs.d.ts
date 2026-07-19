/**
 * Type declarations for Cornerstone.js codec packages.
 * These packages don't ship their own TypeScript declarations.
 */

declare module '@cornerstonejs/codec-charls' {
  interface CharlsCodec {
    init?: () => void;
    decode?: (buffer: Buffer, info: any) => Buffer;
  }
  const codec: CharlsCodec;
  export default codec;
}

declare module '@cornerstonejs/codec-openjpeg' {
  interface OpenjpegCodec {
    init?: () => void;
    decode?: (buffer: Buffer, info: any) => Buffer;
  }
  const codec: OpenjpegCodec;
  export default codec;
}

declare module '@cornerstonejs/codec-libjpeg-turbo-8bit' {
  interface LibjpegTurboCodec {
    ready?: Promise<any>;
    decode?: (buffer: Buffer, info: any) => Buffer;
  }
  const codec: LibjpegTurboCodec;
  export default codec;
}
