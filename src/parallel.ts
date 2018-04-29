import * as async from "async";
import {Fiberit} from "./fiberit";
import * as R from "ramda";

type ErrorMessage = { stack: string, msg: string }
type ErrorMessages = { [index: number]: ErrorMessage; }

export class Parallel {
  /**
   * Executes the syncFunctionOrFunctionWithFiber in parallel over the array values.
   * Accepts a function that is either synchronous or uses coroutines internally (Fiberit).
   * Hint: when there's an error like "callback already called" is that
   * there's a runtime error not managed from async
   * @param array A[]
   * @param syncFunctionOrFunctionWithFiber (A)=>B
   * @param applyToFunction boolean
   * @returns B[]
   * @throws Error
   */
  static map<A, B>(array: A[], syncFunctionOrFunctionWithFiber: (param: A) => B): B[] {
    if (array.length == 0) return [];
    const res = this.mapAsync(array, syncFunctionOrFunctionWithFiber);
    const errors: Error[] = <Error[]> <any[]> res
      .filter((elem) => elem instanceof Error);
    const msg: ErrorMessages = errors.reduce((acc: ErrorMessages, err: Error, index: number) => {
      acc[index] = {msg: err.message, stack: err.stack!};
      return acc
    }, {});
    if (msg[0]) throw new Error(JSON.stringify(msg));
    return <B[]> res;
  }

  static zipMap<A, B>(functs: ReadonlyArray<(...args: A[]) => B>, values: ReadonlyArray<A>) {
    const zipped = R.zip(functs, values);
    return Parallel.map(zipped, ([fun, val]: [(param: A) => B, A]) => fun(val));
  }

  static zipMapWith<A, B>(functs: ReadonlyArray<(...args: A[]) => B>, values: ReadonlyArray<A[]>) {
    const zipped = R.zip(functs, values);
    return Parallel.map(zipped, ([fun, val]: [(param: A) => B, A[]]) => fun.apply(null, val));
  }

  static withData<A, B>(array: A[]): (action: (param: A) => B) => B[] {
    return (action: (param: A) => B) => Parallel.map<A, B>(array, action);
  }

  static pool<A, B>(size: number, data: ReadonlyArray<A>, mapper: (...rest: A[]) => B): B[] {
    const dataSplittedBySize: A[][] = R.splitEvery(size, data);
    const results: B[][] = dataSplittedBySize.map((pairOfData: A[]) => Parallel.map<A, B>(pairOfData, mapper));
    return R.flatten<B>(results);
  }

  static poolWith<A, B>(size: number, data: ReadonlyArray<A>, mapper: (...rest: A[]) => B): B[] {
    const dataSplittedBySize = R.splitEvery(size, data);
    const results: ReadonlyArray<B[]> = dataSplittedBySize.map((pairOfData: A[]) => Parallel.map(pairOfData, mapper));
    return R.flatten<B>(results);
  }

  private static mapAsync<A, B>(array: A[], fn: (param: A) => B): (B | Error)[] {
    return Fiberit.for(async.map as Function, array, (input: A, cb: Function) => {
      return Fiberit.launchFiber(() => {
        try {
          const res = fn.call(fn, input);
          return cb(null, res)
        } catch (e) {
          return cb(e)
        }
      })
    })
  }
}