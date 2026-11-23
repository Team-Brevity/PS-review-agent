import type {GeminiReviewResult} from '../gemini-review/gemini-review.types';
import type {ProducerStatementType} from '../proworkflow/proworkflow.config';

export type ReviewRunStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'skipped_tag'
  | 'skipped_no_mention'
  | 'skipped_no_files'
  | 'skipped_duplicate'
  | 'failed';

export interface ProcessedDocumentSummary {
  keywordType: ProducerStatementType;
  fileId: string;
  fileName: string;
  mimeType: string;
  fileUri: string;
  review: GeminiReviewResult;
  formattedMessage: string;
  postedToProWorkflow: boolean;
}

export interface ReviewRunStep {
  timestamp: string;
  step: string;
  detail: string;
}

export interface ReviewRunRecord {
  id: string;
  taskId: string;
  projectId: string | null;
  projectNumber?: string;
  projectTitle?: string;
  status: ReviewRunStatus;
  reason?: string;
  error?: string;
  taggedEngineers: string[];
  documents: ProcessedDocumentSummary[];
  steps: ReviewRunStep[];
  createdAt: string;
  updatedAt: string;
  finishedAt?: string;
}

interface StoreState {
  runs: ReviewRunRecord[];
  processedMessageKeys: Map<string, number>;
}

const MAX_RUNS = 100;
const DEDUP_TTL_MS = 1000 * 60 * 60 * 6; // 6 hours

declare global {
  var __psReviewStoreState: StoreState | undefined;
}

function getState(): StoreState {
  if (!globalThis.__psReviewStoreState) {
    globalThis.__psReviewStoreState = {
      runs: [],
      processedMessageKeys: new Map<string, number>(),
    };
  }
  return globalThis.__psReviewStoreState;
}

export function createReviewRun(taskId: string, projectId: string | null): ReviewRunRecord {
  const state = getState();
  const now = new Date().toISOString();
  const record: ReviewRunRecord = {
    id: `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    taskId,
    projectId,
    status: 'queued',
    taggedEngineers: [],
    documents: [],
    steps: [
      {
        timestamp: now,
        step: 'webhook_received',
        detail: `Queued edittask event for task ${taskId}${projectId ? ` (project ${projectId})` : ''}`,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };

  state.runs.unshift(record);
  if (state.runs.length > MAX_RUNS) {
    state.runs.length = MAX_RUNS;
  }
  return record;
}

export function appendRunStep(runId: string, step: string, detail: string): void {
  const state = getState();
  const record = state.runs.find((r) => r.id === runId);
  if (!record) return;
  const now = new Date().toISOString();
  record.steps.push({timestamp: now, step, detail});
  record.updatedAt = now;
}

export function updateReviewRun(
  runId: string,
  patch: Partial<Omit<ReviewRunRecord, 'id' | 'steps' | 'createdAt'>>
): void {
  const state = getState();
  const record = state.runs.find((r) => r.id === runId);
  if (!record) return;
  Object.assign(record, patch);
  record.updatedAt = new Date().toISOString();
}

export function listReviewRuns(): ReviewRunRecord[] {
  const state = getState();
  return state.runs.map((r) => ({
    ...r,
    taggedEngineers: [...r.taggedEngineers],
    documents: [...r.documents],
    steps: [...r.steps],
  }));
}

export function hasRecentlyProcessedMessage(taskId: string, messageId: string): boolean {
  const state = getState();
  const now = Date.now();
  // Prune expired dedup keys
  for (const [key, expiresAt] of state.processedMessageKeys.entries()) {
    if (expiresAt <= now) state.processedMessageKeys.delete(key);
  }
  const composite = `${taskId}:${messageId}`;
  const expiry = state.processedMessageKeys.get(composite);
  return typeof expiry === 'number' && expiry > now;
}

export function markMessageProcessed(taskId: string, messageId: string): void {
  const state = getState();
  state.processedMessageKeys.set(`${taskId}:${messageId}`, Date.now() + DEDUP_TTL_MS);
}
