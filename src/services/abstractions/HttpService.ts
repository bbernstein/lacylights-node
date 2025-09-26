import https from "https";
import { IncomingMessage } from "http";

export interface IHttpService {
  get(url: string, callback: (response: IncomingMessage) => void): HttpRequest;
}

export interface HttpRequest {
  on(event: 'error', listener: (error: Error) => void): this;
}

export class HttpService implements IHttpService {
  get(url: string, callback: (response: IncomingMessage) => void): HttpRequest {
    return https.get(url, callback);
  }
}