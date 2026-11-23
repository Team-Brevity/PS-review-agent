import {getAppConfig} from '../config/env';
import {buildProWorkflowRoute, PROWORKFLOW_CONSTANTS} from './proworkflow.config';
import {
  extractProjectContext,
  parseProWorkflowTask,
  selectLatestMessage,
} from './proworkflow.parser';
import type {
  ExtractedProjectContext,
  ProWorkflowMessage,
  ProWorkflowTask,
} from './proworkflow.types';

export interface ProWorkflowGateway {
  fetchTaskDetails(taskId: string): Promise<ProWorkflowTask>;
  fetchLatestTaskMessage(taskId: string): Promise<ProWorkflowMessage | null>;
  fetchProjectContext(projectId: string): Promise<ExtractedProjectContext>;
  postTaskMessage(taskId: string, messageText: string): Promise<{ok: boolean; messageId?: string}>;
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  maxAttempts = 3
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (response.status === 429 || response.status >= 500) {
        if (attempt < maxAttempts) {
          const backoffMs = Math.min(4000, 400 * 2 ** (attempt - 1));
          await new Promise((r) => setTimeout(r, backoffMs));
          continue;
        }
      }
      return response;
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      if (attempt < maxAttempts) {
        const backoffMs = Math.min(4000, 400 * 2 ** (attempt - 1));
        await new Promise((r) => setTimeout(r, backoffMs));
        continue;
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('ProWorkflow request failed after retries');
}

function buildAuthHeaders(): Record<string, string> {
  const cfg = getAppConfig();
  if (!cfg.proworkflow.apiKey) {
    throw new Error('PROWORKFLOW_API_KEY is not configured');
  }
  const value = `${cfg.proworkflow.authSchemePrefix}${cfg.proworkflow.apiKey}`;
  return {
    [cfg.proworkflow.authHeaderName]: value,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

export class HttpProWorkflowClient implements ProWorkflowGateway {
  async fetchTaskDetails(taskId: string): Promise<ProWorkflowTask> {
    const cfg = getAppConfig();
    const url = buildProWorkflowRoute(
      cfg.proworkflow.apiBaseUrl,
      cfg.proworkflow.taskPathTemplate,
      {taskId}
    );
    const res = await fetchWithRetry(
      url,
      {method: 'GET', headers: buildAuthHeaders()},
      cfg.pipeline.requestTimeoutMs
    );
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`ProWorkflow fetchTaskDetails(${taskId}) failed: HTTP ${res.status} ${body.slice(0, 200)}`);
    }
    const json = (await res.json()) as unknown;
    return parseProWorkflowTask(json, taskId);
  }

  async fetchLatestTaskMessage(taskId: string): Promise<ProWorkflowMessage | null> {
    const cfg = getAppConfig();
    const url = buildProWorkflowRoute(
      cfg.proworkflow.apiBaseUrl,
      cfg.proworkflow.taskMessagesPathTemplate,
      {taskId}
    );
    const res = await fetchWithRetry(
      url,
      {method: 'GET', headers: buildAuthHeaders()},
      cfg.pipeline.requestTimeoutMs
    );
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(
        `ProWorkflow fetchLatestTaskMessage(${taskId}) failed: HTTP ${res.status} ${body.slice(0, 200)}`
      );
    }
    const json = (await res.json()) as unknown;
    return selectLatestMessage(json);
  }

  async fetchProjectContext(projectId: string): Promise<ExtractedProjectContext> {
    const cfg = getAppConfig();
    const headers = buildAuthHeaders();
    const projectUrl = buildProWorkflowRoute(
      cfg.proworkflow.apiBaseUrl,
      cfg.proworkflow.projectPathTemplate,
      {projectId}
    );

    const projectRes = await fetchWithRetry(
      projectUrl,
      {method: 'GET', headers},
      cfg.pipeline.requestTimeoutMs
    );
    if (!projectRes.ok) {
      const body = await projectRes.text().catch(() => '');
      throw new Error(
        `ProWorkflow fetchProjectContext(${projectId}) failed: HTTP ${projectRes.status} ${body.slice(0, 200)}`
      );
    }
    const projectJson = (await projectRes.json()) as unknown;

    // Also attempt to fetch project notes if a dedicated notes endpoint is configured
    let extraNotesJson: unknown = undefined;
    if (cfg.proworkflow.projectNotesPathTemplate) {
      try {
        const notesUrl = buildProWorkflowRoute(
          cfg.proworkflow.apiBaseUrl,
          cfg.proworkflow.projectNotesPathTemplate,
          {projectId}
        );
        const notesRes = await fetchWithRetry(
          notesUrl,
          {method: 'GET', headers},
          cfg.pipeline.requestTimeoutMs,
          1
        );
        if (notesRes.ok) {
          extraNotesJson = (await notesRes.json()) as unknown;
        }
      } catch {
        // Optional secondary endpoint; ignore if project API already includes notes
      }
    }

    return extractProjectContext(projectJson, projectId, extraNotesJson);
  }

  async postTaskMessage(
    taskId: string,
    messageText: string
  ): Promise<{ok: boolean; messageId?: string}> {
    const cfg = getAppConfig();
    const url = buildProWorkflowRoute(
      cfg.proworkflow.apiBaseUrl,
      cfg.proworkflow.postTaskMessagePathTemplate,
      {taskId}
    );

    const payload = {
      [PROWORKFLOW_CONSTANTS.MESSAGE_BODY_FIELD_KEY]: messageText,
    };

    const res = await fetchWithRetry(
      url,
      {
        method: 'POST',
        headers: buildAuthHeaders(),
        body: JSON.stringify(payload),
      },
      cfg.pipeline.requestTimeoutMs
    );
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(
        `ProWorkflow postTaskMessage(${taskId}) failed: HTTP ${res.status} ${body.slice(0, 200)}`
      );
    }
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const messageId =
      typeof data.id === 'string' || typeof data.id === 'number'
        ? String(data.id)
        : undefined;
    return {ok: true, messageId};
  }
}

export const proWorkflowClient = new HttpProWorkflowClient();
