export type AssistantErrorCode = 'AUTH_REQUIRED' | 'TOOL_TIMEOUT' | 'TOOL_SCHEMA_ERROR' | 'LLM_RATE_LIMIT' | 'UPSTREAM_API_ERROR' | 'UNKNOWN';

export class AssistantError extends Error {
  constructor(
    public readonly errorCode: AssistantErrorCode,
    message: string,
    public readonly retryable: boolean,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'AssistantError';
  }
}

export function assistantErrorMessage(error: unknown): string {
  if (error instanceof AssistantError) return error.message;
  if (error instanceof TypeError) return 'I could not reach AIRA. Check your connection and try again.';
  return 'I could not complete that request. Please try again in a moment.';
}

const LIST_ITEM_RE = /^\s*(?:\d+\.\s|-\s)/;
const HEADING_RE = /^\s*#{1,6}\s/;

function stripInlineLatex(input: string): string {
  return input.replace(/\$([^$\n]+)\$/g, (_, expr: string) => expr
    .replace(/\\pm\s*/g, '±')
    .replace(/\\times/g, '×')
    .replace(/\\leq?/g, '≤')
    .replace(/\\geq?/g, '≥')
    .replace(/\\approx/g, '≈')
    .replace(/\^?\\circ\b/g, '°')
    .replace(/\\%/g, '%')
    .replace(/\s+/g, ' ')
    .trim());
}

export function normalizeDisplayMarkdown(input: string): string {
  const text = stripInlineLatex(input)
    .replace(/\r\n?/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/^(\s*#{1,6})\s*\*{2,}\s*\n\s*([^\n]+?)\*{1,}\s*$/gm, '$1 $2')
    .trim();
  const lines = text.split('\n').map(line => line
    .replace(/^(\s*#{1,6})([^\s#])/, '$1 $2')
    .replace(/^(\s*#{1,6})\s+\*{2,}\s*(.*?)\s*\*{1,}\s*$/, '$1 $2')
    .replace(/^(\s*(?:#{1,6}\s+)?\d+\.)(?=\S)/, '$1 ')
    .replace(/^(\s*)(?:•|\*(?!\*))\s+/, '$1- ')
    .replace(/\*{3,}([^*\n]+?)\*{1,}/g, (_, inner: string) => `**${inner.trim()}**`)
    .replace(/\*\*([^*\n]+?)\*(?!\*)/g, '$1')
    .replace(/\*\*([^*\n]+?)\*\*/g, (_, inner: string) => `**${inner.trim()}**`)
    .replace(/(\*\*[^*\n]+:\*\*)(?=\S)/g, '$1 '));
  const output: string[] = [];
  for (const line of lines) {
    const prev = output.at(-1);
    const hasPrevContent = Boolean(prev?.trim());
    const needsBlankBeforeHeading = HEADING_RE.test(line) && hasPrevContent;
    const needsBlankAfterHeading = Boolean(prev && HEADING_RE.test(prev) && line.trim());
    const needsBlankBeforeList = LIST_ITEM_RE.test(line) && hasPrevContent && !LIST_ITEM_RE.test(prev ?? '');
    if (needsBlankBeforeHeading || needsBlankAfterHeading || needsBlankBeforeList) {
      output.push('');
    }
    output.push(line);
  }
  return stripDanglingBold(output.join('\n').replace(/\n{3,}/g, '\n\n').trim());
}

export function stripMarkdownForSpeech(input: string): string {
  return normalizeDisplayMarkdown(input)
    .replace(/^#{1,6}[ \t]+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/^[ \t]*[-*•][ \t]+/gm, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function stripDanglingBold(text: string): string {
  return text.split('\n').map(line => {
    const markers = line.match(/\*\*/g)?.length ?? 0;
    return markers % 2 ? line.replace(/\*\*/g, '') : line;
  }).join('\n');
}
