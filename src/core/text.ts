/**
 * Index where the trailing run of line breaks (CR and LF, in any combination) begins;
 * `content.length` when the content does not end with a line break.
 *
 * It is a linear scan on purpose: a regular expression anchored only at the end
 * (like `/(?:\r\n|\r|\n)*$/`) backtracks with super-linear time.
 */
export function trailingLineBreaksStart(content: string): number {
  let start = content.length;
  while (start > 0 && (content[start - 1] === "\r" || content[start - 1] === "\n")) start--;
  return start;
}
