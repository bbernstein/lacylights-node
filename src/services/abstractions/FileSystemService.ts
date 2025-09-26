import fs from "fs";

export interface IFileSystemService {
  existsSync(path: string): boolean;
  mkdirSync(path: string, options?: { recursive?: boolean }): void;
  createWriteStream(path: string): fs.WriteStream;
  readFileSync(path: string, encoding?: BufferEncoding): string;
  writeFileSync(path: string, data: string, encoding?: BufferEncoding): void;
  readdirSync(path: string): string[];
  statSync(path: string): fs.Stats;
  unlinkSync(path: string): void;
  createReadStream(path: string): fs.ReadStream;
}

export class FileSystemService implements IFileSystemService {
  existsSync(filePath: string): boolean {
    return fs.existsSync(filePath);
  }

  mkdirSync(dirPath: string, options?: { recursive?: boolean }): void {
    fs.mkdirSync(dirPath, options);
  }

  createWriteStream(filePath: string): fs.WriteStream {
    return fs.createWriteStream(filePath);
  }

  readFileSync(filePath: string, encoding: BufferEncoding = "utf8"): string {
    return fs.readFileSync(filePath, encoding);
  }

  writeFileSync(filePath: string, data: string, encoding: BufferEncoding = "utf8"): void {
    fs.writeFileSync(filePath, data, encoding);
  }

  readdirSync(dirPath: string): string[] {
    return fs.readdirSync(dirPath);
  }

  statSync(filePath: string): fs.Stats {
    return fs.statSync(filePath);
  }

  unlinkSync(filePath: string): void {
    fs.unlinkSync(filePath);
  }

  createReadStream(filePath: string): fs.ReadStream {
    return fs.createReadStream(filePath);
  }
}