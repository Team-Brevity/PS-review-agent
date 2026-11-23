import type {ProducerStatementType} from '../proworkflow/proworkflow.config';
import type {GeminiReviewResult} from './gemini-review.types';

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : String(item ?? '').trim()))
    .filter(Boolean);
}

export function parseGeminiReviewJson(rawText: string): GeminiReviewResult {
  const trimmed = (rawText || '').trim();
  if (!trimmed) {
    throw new Error('Gemini returned an empty review response');
  }

  // Strip optional markdown code fences if a model accidentally wraps JSON
  const cleaned = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(
      `Failed to parse Gemini JSON output: ${err instanceof Error ? err.message : 'Invalid JSON'}`
    );
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Gemini JSON response must be an object');
  }

  const obj = parsed as Record<string, unknown>;
  return {
    confirmed_flags: toStringArray(obj.confirmed_flags),
    unclear: toStringArray(obj.unclear),
    verified_correct: toStringArray(obj.verified_correct),
  };
}

function formatBulletSection(title: string, items: string[], emptyLabel: string): string[] {
  const lines = [`${title} (${items.length}):`];
  if (items.length === 0) {
    lines.push(`- ${emptyLabel}`);
  } else {
    for (const item of items) {
      lines.push(`- ${item}`);
    }
  }
  return lines;
}

export function formatProWorkflowReviewMessage(params: {
  fileName: string;
  keywordType: ProducerStatementType;
  review: GeminiReviewResult;
  taggedEngineers: string[];
}): string {
  const {fileName, keywordType, review, taggedEngineers} = params;
  const cleanFileName = fileName.trim() || `Document-${keywordType}.pdf`;
  const engineerLine =
    taggedEngineers.length > 0 ? taggedEngineers.join(' ') : 'No specific engineer tagged';

  const lines: string[] = [
    'AI Review Summary',
    `${cleanFileName}-${keywordType}`,
    '',
    ...formatBulletSection(
      'Confirmed Flags (Action Required)',
      review.confirmed_flags,
      'No confirmed flags found.'
    ),
    '',
    ...formatBulletSection(
      'Unclear / Double Check',
      review.unclear,
      'No unclear items flagged.'
    ),
    '',
    ...formatBulletSection(
      'Verified Correct',
      review.verified_correct,
      'No verified items recorded.'
    ),
    '',
    `Ready for Engineering Review: ${engineerLine}`,
  ];

  return lines.join('\n');
}
