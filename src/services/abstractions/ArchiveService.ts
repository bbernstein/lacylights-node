import unzipper from "unzipper";
import { IFileSystemService } from "./FileSystemService";

export interface IArchiveService {
  extractZip(zipPath: string, extractPath: string): Promise<void>;
}

export class ArchiveService implements IArchiveService {
  constructor(private fileSystem: IFileSystemService) {}

  extractZip(zipPath: string, extractPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const readStream = this.fileSystem.createReadStream(zipPath);

      readStream
        .pipe(unzipper.Extract({ path: extractPath }))
        .on('close', () => resolve())
        .on('error', (error) => reject(error));
    });
  }
}