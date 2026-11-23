import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatProWorkflowReviewMessage,
  parseGeminiReviewJson,
} from './gemini-review.formatter';

test('parseGeminiReviewJson parses raw JSON and strips accidental markdown fences', () => {
  const fenced = `\`\`\`json
  {
    "confirmed_flags": ["client name incorrect on page 2 (TO field shows 'Smith Corp', expected 'Smith Ltd')"],
    "unclear": ["project number unclear on page 1 (text is blurry/obscured)"],
    "verified_correct": ["address/location: verified"]
  }
  \`\`\``;

  const result = parseGeminiReviewJson(fenced);
  assert.equal(result.confirmed_flags.length, 1);
  assert.equal(result.unclear.length, 1);
  assert.equal(result.verified_correct.length, 1);
});

test('formatProWorkflowReviewMessage creates human-readable ProWorkflow message matching requested structure', () => {
  const formatted = formatProWorkflowReviewMessage({
    fileName: 'Waipapa_Racking_PS1.pdf',
    keywordType: 'PS1',
    review: {
      confirmed_flags: ["job specific note '2400KG beam level rating' missing from page 3"],
      unclear: ["project number unclear on page 1"],
      verified_correct: ["address/location: verified"],
    },
    taggedEngineers: ['@John', '@Sarah'],
  });

  assert.match(formatted, /^AI Review Summary\nWaipapa_Racking_PS1\.pdf-PS1/);
  assert.match(formatted, /Confirmed Flags \(Action Required\) \(1\):/);
  assert.match(formatted, /- job specific note '2400KG beam level rating' missing from page 3/);
  assert.match(formatted, /Unclear \/ Double Check \(1\):/);
  assert.match(formatted, /Verified Correct \(1\):/);
  assert.match(formatted, /Ready for Engineering Review: @John @Sarah$/);
  assert.equal(formatted.includes('"confirmed_flags"'), false);
});
