export type ProducerStatementType = 'PS1' | 'PS2' | 'PS4';

export const PROWORKFLOW_CONSTANTS = {
  WEBHOOK_EVENT_EDIT_TASK: 'edittask',
  SUPPORTED_PS_KEYWORDS: ['ps1', 'ps2', 'ps4'] as const,
  MESSAGE_BODY_FIELD_KEY: 'content',
} as const;

export function buildProWorkflowRoute(
  baseUrl: string,
  template: string,
  params: {taskId?: string; projectId?: string}
): string {
  let path = template;
  if (params.taskId !== undefined) {
    path = path.replaceAll('{taskId}', encodeURIComponent(params.taskId));
  }
  if (params.projectId !== undefined) {
    path = path.replaceAll('{projectId}', encodeURIComponent(params.projectId));
  }
  const normalizedBase = baseUrl.replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}
