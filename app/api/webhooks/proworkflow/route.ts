import crypto from 'node:crypto';
import {NextRequest, NextResponse} from 'next/server';
import {getAppConfig} from '@/features/config/env';
import {PROWORKFLOW_CONSTANTS} from '@/features/proworkflow/proworkflow.config';
import {extractWebhookIds} from '@/features/proworkflow/proworkflow.parser';
import {enqueueReviewTask} from '@/features/review-pipeline/review.orchestrator';

function timingSafeMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function verifyWebhookSecret(req: NextRequest, expectedSecret: string): boolean {
  if (!expectedSecret) return true;

  const headerSecret =
    req.headers.get('x-proworkflow-secret') ||
    req.headers.get('x-webhook-secret') ||
    '';

  const authHeader = req.headers.get('authorization') || '';
  const bearerSecret = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';

  const querySecret = req.nextUrl.searchParams.get('secret') || '';

  const candidates = [headerSecret.trim(), bearerSecret, querySecret.trim()].filter(Boolean);
  return candidates.some((candidate) => timingSafeMatch(candidate, expectedSecret));
}

async function parseIncomingBody(req: NextRequest): Promise<unknown> {
  const contentType = req.headers.get('content-type') || '';
  const rawText = await req.text();
  if (!rawText.trim()) return null;

  if (contentType.includes('application/x-www-form-urlencoded')) {
    const params = new URLSearchParams(rawText);
    const obj: Record<string, string> = {};
    for (const [k, v] of params.entries()) {
      obj[k] = v;
    }
    return obj;
  }

  return JSON.parse(rawText);
}

export async function POST(req: NextRequest) {
  const cfg = getAppConfig();

  if (!verifyWebhookSecret(req, cfg.proworkflow.webhookSecret)) {
    return NextResponse.json({error: 'Unauthorized webhook request'}, {status: 401});
  }

  let body: unknown;
  try {
    body = await parseIncomingBody(req);
  } catch {
    return NextResponse.json({error: 'Invalid webhook payload body'}, {status: 400});
  }

  const extracted = extractWebhookIds(body);
  if (!extracted) {
    return NextResponse.json(
      {error: 'Webhook payload missing valid taskId'},
      {status: 400}
    );
  }

  if (
    extracted.event &&
    extracted.event !== PROWORKFLOW_CONSTANTS.WEBHOOK_EVENT_EDIT_TASK
  ) {
    return NextResponse.json(
      {
        received: true,
        ignored: true,
        reason: `Ignored event "${extracted.event}" (expected "${PROWORKFLOW_CONSTANTS.WEBHOOK_EVENT_EDIT_TASK}")`,
      },
      {status: 200}
    );
  }

  // Hand taskId + optional projectId to non-awaited background pipeline and return HTTP 200 immediately
  const run = enqueueReviewTask({
    taskId: extracted.taskId,
    projectId: extracted.projectId,
  });

  return NextResponse.json(
    {
      received: true,
      queued: true,
      runId: run.id,
      taskId: extracted.taskId,
      projectId: extracted.projectId,
    },
    {status: 200}
  );
}
