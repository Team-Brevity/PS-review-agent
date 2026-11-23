import {NextRequest, NextResponse} from 'next/server';
import {getAppConfig} from '@/features/config/env';
import {
  formatProWorkflowReviewMessage,
  parseGeminiReviewJson,
} from '@/features/gemini-review/gemini-review.formatter';
import {buildReviewUserPrompt} from '@/features/gemini-review/gemini-review.prompt';
import {
  extractProjectContext,
  extractWebhookIds,
  parseMessageDirectives,
} from '@/features/proworkflow/proworkflow.parser';

interface InspectRequestBody {
  webhookPayloadJson?: string;
  messageHtml?: string;
  projectTitle?: string;
  projectNotesText?: string;
  sampleGeminiJson?: string;
  sampleFileName?: string;
}

export async function POST(req: NextRequest) {
  let body: InspectRequestBody;
  try {
    body = (await req.json()) as InspectRequestBody;
  } catch {
    return NextResponse.json({error: 'Invalid JSON request body'}, {status: 400});
  }

  const cfg = getAppConfig();

  let webhookIds = null;
  let webhookParseError: string | null = null;
  if (typeof body.webhookPayloadJson === 'string' && body.webhookPayloadJson.trim()) {
    try {
      const parsedPayload = JSON.parse(body.webhookPayloadJson);
      webhookIds = extractWebhookIds(parsedPayload);
      if (!webhookIds) {
        webhookParseError = 'No taskId found in webhook payload';
      }
    } catch (err) {
      webhookParseError = err instanceof Error ? err.message : 'Invalid webhook JSON';
    }
  }

  const messageDirectives = parseMessageDirectives(
    typeof body.messageHtml === 'string' ? body.messageHtml : '',
    cfg.proworkflow.mentionTrigger
  );

  const projectContext = extractProjectContext(
    {
      id: webhookIds?.projectId || 'preview-project',
      title: typeof body.projectTitle === 'string' ? body.projectTitle : '',
      privatenotes: typeof body.projectNotesText === 'string' ? body.projectNotesText : '',
    },
    webhookIds?.projectId || 'preview-project'
  );

  const primaryDoc = messageDirectives.driveDocuments[0];
  const keywordType = primaryDoc?.keywordType || 'PS1';
  const fileName =
    (typeof body.sampleFileName === 'string' && body.sampleFileName.trim()) ||
    `${projectContext.projectNumber || 'Document'}_${keywordType}_Draft.pdf`;

  const userPrompt = buildReviewUserPrompt(projectContext, keywordType, fileName);

  let formattedReply: string | null = null;
  let geminiParseError: string | null = null;
  if (typeof body.sampleGeminiJson === 'string' && body.sampleGeminiJson.trim()) {
    try {
      const parsedReview = parseGeminiReviewJson(body.sampleGeminiJson);
      formattedReply = formatProWorkflowReviewMessage({
        fileName,
        keywordType,
        review: parsedReview,
        taggedEngineers: messageDirectives.taggedEngineers,
      });
    } catch (err) {
      geminiParseError = err instanceof Error ? err.message : 'Invalid Gemini JSON';
    }
  }

  return NextResponse.json({
    webhookIds,
    webhookParseError,
    messageDirectives,
    projectContext,
    userPrompt,
    formattedReply,
    geminiParseError,
  });
}
