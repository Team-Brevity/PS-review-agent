export interface AppConfig {
  geminiApiKey: string;
  geminiModel: string;
  proworkflow: {
    apiBaseUrl: string;
    apiKey: string;
    authHeaderName: string;
    authSchemePrefix: string;
    webhookSecret: string;
    taskPathTemplate: string;
    taskMessagesPathTemplate: string;
    postTaskMessagePathTemplate: string;
    projectPathTemplate: string;
    projectNotesPathTemplate: string;
    reviewTag: string;
    mentionTrigger: string;
  };
  driveUpload: {
    endpointUrl: string;
    webhookSecret: string;
  };
  pipeline: {
    maxConcurrentReviews: number;
    requestTimeoutMs: number;
  };
}

export interface ConfigReadiness {
  geminiApiKeyConfigured: boolean;
  geminiModel: string;
  proworkflowApiKeyConfigured: boolean;
  proworkflowWebhookSecretConfigured: boolean;
  driveUploadSecretConfigured: boolean;
  proworkflowApiBaseUrl: string;
  driveUploadEndpointUrl: string;
  reviewTag: string;
  mentionTrigger: string;
  maxConcurrentReviews: number;
  routes: {
    taskPathTemplate: string;
    taskMessagesPathTemplate: string;
    postTaskMessagePathTemplate: string;
    projectPathTemplate: string;
    projectNotesPathTemplate: string;
  };
}

const DEFAULT_DRIVE_UPLOAD_URL =
  'https://script.google.com/macros/s/AKfycbyfy_w8Cqlxsk2cAkIEK39cRWW-tW-_2vywukMcFNXBPrkCgqL_uDFtRsEZZl8pu3tXKQ/exec';

function readInt(value: string | undefined, fallback: number, min: number, max: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function getAppConfig(): AppConfig {
  const baseUrl = (process.env.PROWORKFLOW_API_BASE_URL || 'https://api.proworkflow.com/api/v4').replace(
    /\/+$/,
    ''
  );
  const authHeaderName = (process.env.PROWORKFLOW_AUTH_HEADER || 'apikey').trim();
  const authSchemePrefix =
    process.env.PROWORKFLOW_AUTH_PREFIX ??
    (authHeaderName.toLowerCase() === 'authorization' ? 'Bearer ' : '');

  return {
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    geminiModel: process.env.GEMINI_MODEL || 'gemini-4-hydrogen',
    proworkflow: {
      apiBaseUrl: baseUrl,
      apiKey: process.env.PROWORKFLOW_API_KEY || '',
      authHeaderName,
      authSchemePrefix,
      webhookSecret: process.env.PROWORKFLOW_WEBHOOK_SECRET || '',
      taskPathTemplate: process.env.PROWORKFLOW_TASK_PATH || '/projects/items/{taskId}',
      taskMessagesPathTemplate:
        process.env.PROWORKFLOW_TASK_MESSAGES_PATH || '/projects/items/{taskId}/messages',
      postTaskMessagePathTemplate:
        process.env.PROWORKFLOW_POST_TASK_MESSAGE_PATH || '/projects/items/{taskId}/messages',
      projectPathTemplate: process.env.PROWORKFLOW_PROJECT_PATH || '/projects/{projectId}',
      projectNotesPathTemplate:
        process.env.PROWORKFLOW_PROJECT_NOTES_PATH || '/projects/{projectId}/notes',
      reviewTag: process.env.PROWORKFLOW_REVIEW_TAG || 'review-agent',
      mentionTrigger: process.env.PROWORKFLOW_MENTION_TRIGGER || '@review-agent',
    },
    driveUpload: {
      endpointUrl: process.env.DRIVE_TO_GEMINI_UPLOAD_URL || DEFAULT_DRIVE_UPLOAD_URL,
      webhookSecret: process.env.DRIVE_TO_GEMINI_WEBHOOK_SECRET || '',
    },
    pipeline: {
      maxConcurrentReviews: readInt(process.env.MAX_CONCURRENT_REVIEWS, 4, 1, 16),
      requestTimeoutMs: readInt(process.env.UPSTREAM_TIMEOUT_MS, 45000, 5000, 180000),
    },
  };
}

export function getConfigReadiness(): ConfigReadiness {
  const cfg = getAppConfig();
  return {
    geminiApiKeyConfigured: Boolean(cfg.geminiApiKey.trim()),
    geminiModel: cfg.geminiModel,
    proworkflowApiKeyConfigured: Boolean(cfg.proworkflow.apiKey.trim()),
    proworkflowWebhookSecretConfigured: Boolean(cfg.proworkflow.webhookSecret.trim()),
    driveUploadSecretConfigured: Boolean(cfg.driveUpload.webhookSecret.trim()),
    proworkflowApiBaseUrl: cfg.proworkflow.apiBaseUrl,
    driveUploadEndpointUrl: cfg.driveUpload.endpointUrl,
    reviewTag: cfg.proworkflow.reviewTag,
    mentionTrigger: cfg.proworkflow.mentionTrigger,
    maxConcurrentReviews: cfg.pipeline.maxConcurrentReviews,
    routes: {
      taskPathTemplate: cfg.proworkflow.taskPathTemplate,
      taskMessagesPathTemplate: cfg.proworkflow.taskMessagesPathTemplate,
      postTaskMessagePathTemplate: cfg.proworkflow.postTaskMessagePathTemplate,
      projectPathTemplate: cfg.proworkflow.projectPathTemplate,
      projectNotesPathTemplate: cfg.proworkflow.projectNotesPathTemplate,
    },
  };
}
