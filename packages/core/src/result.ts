// Expected business rejections are values; unexpected infrastructure errors are thrown.
export type Failure<Code extends string> = { ok: false; code: Code; message: string };

export function failure<Code extends string>(code: Code, message: string): Failure<Code> {
  return { ok: false, code, message };
}
