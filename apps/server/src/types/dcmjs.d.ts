declare module 'dcmjs' {
  namespace data {
    class DicomMessage {
      static readFile(buffer: ArrayBuffer): { dict: Record<string, any> };
      static writeFile(dict: Record<string, any>, options?: any): ArrayBuffer;
    }

    class DicomMetaDictionary {
      static nameMap: Record<string, { tag: string; vr: string; vm: string; name: string }>;
      static dictionary: Record<string, any>;
      static keywordToTag?: Record<string, string>;
      static tagForKeyword?(keyword: string): string;
      static keywordForKeyword?(keyword: string): string;
    }

    class DicomDict {
      constructor(meta?: Record<string, any>);
      dict: Record<string, any>;
      write(options?: any): ArrayBuffer;
    }
  }
}
