import {getAppConfig} from '../config/env';
import {driveUploadClient} from '../drive-upload/drive-upload.client';
import type {DriveUploadGateway} from '../drive-upload/drive-upload.types';
import {geminiReviewClient} from '../gemini-review/gemini-review.client';
import {formatProWorkflowReviewMessage} from '../gemini-review/gemini-review.formatter';
import type {GeminiReviewGateway} from '../gemini-review/gemini-review.types';
import {proWorkflowClient, type ProWorkflowGateway} from '../proworkflow/proworkflow.client';
import {hasRequiredTag, parseMessageDirectives} from '../proworkflow/proworkflow.parser';
import {ConcurrencyLimiter, KeyedMutex} from './concurrency';
import {
  appendRunStep,
  createReviewRun,
  hasRecentlyProcessedMessage,
  markMessageProcessed,
  type ProcessedDocumentSummary,
  type ReviewRunRecord,
  updateReviewRun,
} from './review.store';

export interface ReviewJobInput {
  taskId: string;
  projectId: string | null;
}

export interface ReviewPipelineDeps {
  proworkflow: ProWorkflowGateway;
  driveUpload: DriveUploadGateway;
  geminiReview: GeminiReviewGateway;
  reviewTag: string;
  mentionTrigger: string;
  deduplicateMessages?: boolean;
}

declare global {
  var __psReviewLimiter: ConcurrencyLimiter | undefined;
  var __psTaskMutex: KeyedMutex | undefined;
}

function getLimiter(): ConcurrencyLimiter {
  if (!globalThis.__psReviewLimiter) {
    const cfg = getAppConfig();
    globalThis.__psReviewLimiter = new ConcurrencyLimiter(cfg.pipeline.maxConcurrentReviews);
  }
  return globalThis.__psReviewLimiter;
}

function getTaskMutex(): KeyedMutex {
  if (!globalThis.__psTaskMutex) {
    globalThis.__psTaskMutex = new KeyedMutex();
  }
  return globalThis.__psTaskMutex;
}

function getDefaultDeps(): ReviewPipelineDeps {
  const cfg = getAppConfig();
  return {
    proworkflow: proWorkflowClient,
    driveUpload: driveUploadClient,
    geminiReview: geminiReviewClient,
    reviewTag: cfg.proworkflow.reviewTag,
    mentionTrigger: cfg.proworkflow.mentionTrigger,
    deduplicateMessages: true,
  };
}

export async function executeReviewJob(
  input: ReviewJobInput,
  deps: ReviewPipelineDeps = getDefaultDeps(),
  existingRunId?: string
): Promise<ReviewRunRecord> {
  const runRecord = existingRunId
    ? {id: existingRunId}
    : createReviewRun(input.taskId, input.projectId);
  const runId = runRecord.id;

  updateReviewRun(runId, {status: 'running'});

  try {
    // Step 1: Fetch specific task details from ProWorkflow
    appendRunStep(runId, 'fetch_task', `Fetching ProWorkflow task ${input.taskId}`);
    const task = await deps.proworkflow.fetchTaskDetails(input.taskId);

    // Step 2: Check if task currently has the "review-agent" tag
    if (!hasRequiredTag(task, deps.reviewTag)) {
      const reason = `Task ${input.taskId} does not have tag "${deps.reviewTag}" (found: ${task.tags.join(', ') || 'none'})`;
      appendRunStep(runId, 'check_tag', reason);
      updateReviewRun(runId, {
        status: 'skipped_tag',
        reason,
        finishedAt: new Date().toISOString(),
      });
      return {
        ...createSnapshotFromResult(runId, input, 'skipped_tag', reason),
      };
    }
    appendRunStep(runId, 'check_tag', `Verified task tag "${deps.reviewTag}"`);

    // Step 3: Fetch latest message for that task ID
    appendRunStep(runId, 'fetch_message', `Fetching latest message for task ${input.taskId}`);
    const latestMessage = await deps.proworkflow.fetchLatestTaskMessage(input.taskId);
    if (!latestMessage) {
      const reason = `No messages found on task ${input.taskId}`;
      appendRunStep(runId, 'check_mention', reason);
      updateReviewRun(runId, {
        status: 'skipped_no_mention',
        reason,
        finishedAt: new Date().toISOString(),
      });
      return createSnapshotFromResult(runId, input, 'skipped_no_mention', reason);
    }

    // Step 4: Check if latest message contains "@review-agent"
    const directives = parseMessageDirectives(latestMessage.body, deps.mentionTrigger);
    if (!directives.hasReviewTrigger) {
      const reason = `Latest message (${latestMessage.id}) does not contain "${deps.mentionTrigger}"`;
      appendRunStep(runId, 'check_mention', reason);
      updateReviewRun(runId, {
        status: 'skipped_no_mention',
        reason,
        finishedAt: new Date().toISOString(),
      });
      return createSnapshotFromResult(runId, input, 'skipped_no_mention', reason);
    }

    if (
      deps.deduplicateMessages !== false &&
      hasRecentlyProcessedMessage(input.taskId, latestMessage.id)
    ) {
      const reason = `Message ${latestMessage.id} on task ${input.taskId} was already processed recently`;
      appendRunStep(runId, 'dedup_check', reason);
      updateReviewRun(runId, {
        status: 'skipped_duplicate',
        reason,
        finishedAt: new Date().toISOString(),
      });
      return createSnapshotFromResult(runId, input, 'skipped_duplicate', reason);
    }

    updateReviewRun(runId, {taggedEngineers: directives.taggedEngineers});
    appendRunStep(
      runId,
      'parse_message',
      `Detected trigger "${deps.mentionTrigger}", ${directives.taggedEngineers.length} engineer tag(s), ${directives.driveDocuments.length} hyperlinked PS document(s)`
    );

    if (directives.driveDocuments.length === 0) {
      const reason =
        'No hyperlinked Google Drive documents found for keywords [ps1, ps2, ps4] in latest message';
      appendRunStep(runId, 'extract_links', reason);
      updateReviewRun(runId, {
        status: 'skipped_no_files',
        reason,
        finishedAt: new Date().toISOString(),
      });
      return createSnapshotFromResult(runId, input, 'skipped_no_files', reason);
    }

    // Step 5: Resolve projectId (from webhook payload or from task details)
    const resolvedProjectId = input.projectId || task.projectId;
    if (!resolvedProjectId) {
      throw new Error(
        `Unable to resolve projectId for task ${input.taskId} from webhook or task details`
      );
    }
    updateReviewRun(runId, {projectId: resolvedProjectId});

    // Step 6: Fetch project info (Project Number, Project Title, Address, Job Specific Notes)
    appendRunStep(runId, 'fetch_project', `Fetching project context for project ${resolvedProjectId}`);
    const projectContext = await deps.proworkflow.fetchProjectContext(resolvedProjectId);
    updateReviewRun(runId, {
      projectNumber: projectContext.projectNumber,
      projectTitle: projectContext.projectTitle,
    });
    appendRunStep(
      runId,
      'parse_project',
      `Loaded project "${projectContext.projectNumber} - ${projectContext.projectTitle}"`
    );

    // Step 7: Process each matching keyword [ps1, ps2, ps4] -> Drive upload -> Gemini review -> ProWorkflow reply
    const processedDocs: ProcessedDocumentSummary[] = [];

    for (const docLink of directives.driveDocuments) {
      appendRunStep(
        runId,
        'upload_to_gemini',
        `Uploading ${docLink.keywordType} (Drive fileId: ${docLink.fileId}) to Gemini storage`
      );
      const uploaded = await deps.driveUpload.uploadDriveFileToGemini(docLink.fileId);

      appendRunStep(
        runId,
        'gemini_review',
        `Running Gemini advisory review on ${uploaded.fileName} (${docLink.keywordType})`
      );
      const review = await deps.geminiReview.reviewDocument({
        projectContext,
        keywordType: docLink.keywordType,
        fileUri: uploaded.fileUri,
        mimeType: uploaded.mimeType,
        fileName: uploaded.fileName,
      });

      const formattedMessage = formatProWorkflowReviewMessage({
        fileName: uploaded.fileName,
        keywordType: docLink.keywordType,
        review,
        taggedEngineers: directives.taggedEngineers,
      });

      appendRunStep(
        runId,
        'post_proworkflow_message',
        `Posting AI Review Summary for ${uploaded.fileName}-${docLink.keywordType} to task ${input.taskId}`
      );
      await deps.proworkflow.postTaskMessage(input.taskId, formattedMessage);

      processedDocs.push({
        keywordType: docLink.keywordType,
        fileId: docLink.fileId,
        fileName: uploaded.fileName,
        mimeType: uploaded.mimeType,
        fileUri: uploaded.fileUri,
        review,
        formattedMessage,
        postedToProWorkflow: true,
      });
    }

    if (deps.deduplicateMessages !== false) {
      markMessageProcessed(input.taskId, latestMessage.id);
    }

    const finishedAt = new Date().toISOString();
    updateReviewRun(runId, {
      status: 'completed',
      documents: processedDocs,
      finishedAt,
    });

    return {
      id: runId,
      taskId: input.taskId,
      projectId: resolvedProjectId,
      projectNumber: projectContext.projectNumber,
      projectTitle: projectContext.projectTitle,
      status: 'completed',
      taggedEngineers: directives.taggedEngineers,
      documents: processedDocs,
      steps: [],
      createdAt: finishedAt,
      updatedAt: finishedAt,
      finishedAt,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    appendRunStep(runId, 'error', message);
    updateReviewRun(runId, {
      status: 'failed',
      error: message,
      finishedAt: new Date().toISOString(),
    });
    return createSnapshotFromResult(runId, input, 'failed', undefined, message);
  }
}

function createSnapshotFromResult(
  id: string,
  input: ReviewJobInput,
  status: ReviewRunRecord['status'],
  reason?: string,
  error?: string
): ReviewRunRecord {
  const now = new Date().toISOString();
  return {
    id,
    taskId: input.taskId,
    projectId: input.projectId,
    status,
    reason,
    error,
    taggedEngineers: [],
    documents: [],
    steps: [],
    createdAt: now,
    updatedAt: now,
    finishedAt: now,
  };
}

/**
 * Non-awaited background dispatcher for the ProWorkflow webhook endpoint.
 * Returns immediately with the queued run ID while executing safely under
 * per-task mutex + global concurrency limiter.
 */
export function enqueueReviewTask(input: ReviewJobInput): ReviewRunRecord {
  const run = createReviewRun(input.taskId, input.projectId);
  const limiter = getLimiter();
  const mutex = getTaskMutex();

  void mutex
    .runExclusive(input.taskId, () =>
      limiter.run(() => executeReviewJob(input, getDefaultDeps(), run.id))
    )
    .catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      appendRunStep(run.id, 'fatal_error', msg);
      updateReviewRun(run.id, {
        status: 'failed',
        error: msg,
        finishedAt: new Date().toISOString(),
      });
    });

  return run;
}
