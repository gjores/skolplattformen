/** Ordnar anrop från en klient. Fel stoppar uppgifter som redan väntar på dem. */
export class PlanningWriteQueue {
  private tail: Promise<unknown> | undefined;

  run<T>(write: () => Promise<T>): Promise<T> {
    const result = this.tail ? this.tail.then(write) : Promise.resolve().then(write);
    this.tail = result;
    const clear = () => { if (this.tail === result) this.tail = undefined; };
    // Hantera båda utfallen utan en oobserverad finally-promise.
    void result.then(clear, clear);
    return result;
  }
}
