import { Separator } from '@/components/ui/separator';

export function ReplyDiff({
  before: beforeText,
  after: afterText,
}: {
  before: string;
  after: string;
}) {
  // Highlight the changed span while keeping both full replies readable, including Arabic.
  const before = Array.from(beforeText);
  const after = Array.from(afterText);
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let end = 0;
  while (
    end < before.length - start &&
    end < after.length - start &&
    before[before.length - end - 1] === after[after.length - end - 1]
  )
    end++;
  return (
    <div className="flex flex-col gap-4 text-sm">
      <div className="flex flex-col gap-2">
        <p className="font-medium">Original draft</p>
        <p dir="auto" className="whitespace-pre-wrap leading-relaxed">
          {before.slice(0, start).join('')}
          <del>{before.slice(start, before.length - end).join('')}</del>
          {before.slice(before.length - end).join('')}
        </p>
      </div>
      <Separator />
      <div className="flex flex-col gap-2">
        <p className="font-medium">Edited reply</p>
        <p dir="auto" className="whitespace-pre-wrap leading-relaxed">
          {after.slice(0, start).join('')}
          <ins>{after.slice(start, after.length - end).join('')}</ins>
          {after.slice(after.length - end).join('')}
        </p>
      </div>
    </div>
  );
}
