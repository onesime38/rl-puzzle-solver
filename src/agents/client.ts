import type { WorkerRequest, WorkerResponse } from "./protocol";

type ResponseHandler = (response: WorkerResponse) => void;

/**
 * Promise-based wrapper around the training Web Worker. One instance is shared
 * by the whole application. All engine code runs off the main thread, so the
 * user interface never freezes during training or benchmarking.
 */
export class SolverClient {
  private readonly worker: Worker;
  private readonly handlers = new Set<ResponseHandler>();
  private readonly pending = new Map<number, (response: WorkerResponse) => void>();
  private seq = 0;

  constructor() {
    this.worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const response = event.data;
      for (const handler of this.handlers) handler(response);
      const id = (response as WorkerResponse & { id?: number }).id;
      if (id !== undefined) {
        const resolve = this.pending.get(id);
        if (resolve) {
          this.pending.delete(id);
          resolve(response);
        }
      }
    };
  }

  /** Subscribes to every response coming from the worker. Returns an unsubscribe fn. */
  onResponse(handler: ResponseHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  /** Fire-and-forget request. */
  post(request: WorkerRequest): void {
    this.worker.postMessage(request);
  }

  /** Request that expects a response carrying the same `id`. */
  request(request: WorkerRequest & { id: number }): Promise<WorkerResponse> {
    return new Promise((resolve) => {
      this.pending.set(request.id, resolve);
      this.worker.postMessage(request);
    });
  }

  nextId(): number {
    return ++this.seq;
  }

  dispose(): void {
    this.worker.terminate();
    this.handlers.clear();
    this.pending.clear();
  }
}

export type { WorkerRequest, WorkerResponse };