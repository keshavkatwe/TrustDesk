export function replyDiff(original: string, updated: string) {
  const before = Array.from(original);
  const after = Array.from(updated);
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let end = 0;
  while (
    end < before.length - start &&
    end < after.length - start &&
    before[before.length - end - 1] === after[after.length - end - 1]
  )
    end++;
  return {
    start,
    removed: before.slice(start, before.length - end).join(''),
    added: after.slice(start, after.length - end).join(''),
  };
}
