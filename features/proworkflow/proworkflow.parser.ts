import type {ProducerStatementType} from './proworkflow.config';
import type {
  DriveDocumentLink,
  ExtractedProjectContext,
  ParsedMessageDirectives,
  ProWorkflowMessage,
  ProWorkflowTask,
  ProWorkflowWebhookIds,
} from './proworkflow.types';

function asRecord(val: unknown): Record<string, unknown> | null {
  if (val && typeof val === 'object' && !Array.isArray(val)) {
    return val as Record<string, unknown>;
  }
  return null;
}

function asNonEmptyId(val: unknown): string | null {
  if (typeof val === 'number' && Number.isFinite(val) && val > 0) {
    return String(val);
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed.length > 0 && trimmed !== '0' && trimmed.toLowerCase() !== 'null') {
      return trimmed;
    }
  }
  return null;
}

function asString(val: unknown): string {
  return typeof val === 'string' ? val.trim() : '';
}

export function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&ndash;/gi, '–')
    .replace(/&mdash;/gi, '—');
}

export function stripHtmlToText(input: string): string {
  if (!input) return '';
  const withLineBreaks = input
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n- ');
  const withoutTags = withLineBreaks.replace(/<[^>]+>/g, ' ');
  return decodeHtmlEntities(withoutTags)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function extractWebhookIds(payload: unknown): ProWorkflowWebhookIds | null {
  const root = asRecord(payload);
  if (!root) return null;

  const nestedData = asRecord(root.data) ?? asRecord(root.task) ?? asRecord(root.item) ?? root;

  const rawEvent =
    asString(root.event) ||
    asString(root.trigger) ||
    asString(root.action) ||
    asString(root.type) ||
    asString(nestedData.event) ||
    'edittask';

  const taskId =
    asNonEmptyId(root.taskid) ??
    asNonEmptyId(root.taskId) ??
    asNonEmptyId(root.task_id) ??
    asNonEmptyId(root.itemid) ??
    asNonEmptyId(root.itemId) ??
    asNonEmptyId(root.id) ??
    asNonEmptyId(nestedData.taskid) ??
    asNonEmptyId(nestedData.taskId) ??
    asNonEmptyId(nestedData.task_id) ??
    asNonEmptyId(nestedData.id);

  if (!taskId) return null;

  const projectObj = asRecord(nestedData.project) ?? asRecord(root.project);
  const projectId =
    asNonEmptyId(root.projectid) ??
    asNonEmptyId(root.projectId) ??
    asNonEmptyId(root.project_id) ??
    asNonEmptyId(nestedData.projectid) ??
    asNonEmptyId(nestedData.projectId) ??
    asNonEmptyId(nestedData.project_id) ??
    asNonEmptyId(projectObj?.id) ??
    null;

  return {
    event: rawEvent.toLowerCase(),
    taskId,
    projectId,
  };
}

export function normalizeTagList(rawTags: unknown, fallbackSingleTag?: unknown): string[] {
  const results: string[] = [];

  const pushIfValid = (v: unknown) => {
    if (typeof v === 'string') {
      for (const part of v.split(',')) {
        const clean = part.trim();
        if (clean) results.push(clean);
      }
    } else if (v && typeof v === 'object') {
      const rec = v as Record<string, unknown>;
      const candidate = asString(rec.name) || asString(rec.title) || asString(rec.label) || asString(rec.tag);
      if (candidate) results.push(candidate);
    }
  };

  if (Array.isArray(rawTags)) {
    for (const item of rawTags) pushIfValid(item);
  } else if (rawTags !== undefined) {
    pushIfValid(rawTags);
  }

  if (fallbackSingleTag !== undefined) {
    pushIfValid(fallbackSingleTag);
  }

  return Array.from(new Set(results));
}

export function parseProWorkflowTask(payload: unknown, fallbackTaskId: string): ProWorkflowTask {
  const root = asRecord(payload) ?? {};
  const taskObj =
    asRecord(root.task) ??
    asRecord(root.item) ??
    asRecord(root.data) ??
    root;

  const id =
    asNonEmptyId(taskObj.id) ??
    asNonEmptyId(taskObj.taskid) ??
    asNonEmptyId(taskObj.itemid) ??
    fallbackTaskId;

  const projectObj = asRecord(taskObj.project);
  const projectId =
    asNonEmptyId(taskObj.projectid) ??
    asNonEmptyId(taskObj.projectId) ??
    asNonEmptyId(taskObj.project_id) ??
    asNonEmptyId(projectObj?.id) ??
    null;

  const tags = normalizeTagList(taskObj.tags ?? taskObj.taglist, taskObj.tag);

  return {
    id,
    title: asString(taskObj.title) || asString(taskObj.name) || undefined,
    name: asString(taskObj.name) || asString(taskObj.title) || undefined,
    projectId,
    tags,
    raw: taskObj,
  };
}

export function hasRequiredTag(task: Pick<ProWorkflowTask, 'tags'>, requiredTag: string): boolean {
  const target = requiredTag.trim().toLowerCase();
  if (!target) return false;
  return task.tags.some((t) => t.trim().toLowerCase() === target);
}

export function selectLatestMessage(payload: unknown): ProWorkflowMessage | null {
  let list: unknown[] = [];
  if (Array.isArray(payload)) {
    list = payload;
  } else {
    const root = asRecord(payload);
    if (!root) return null;
    if (Array.isArray(root.messages)) list = root.messages;
    else if (Array.isArray(root.data)) list = root.data;
    else if (Array.isArray(root.items)) list = root.items;
    else if (Array.isArray(root.comments)) list = root.comments;
    else if (root.message && typeof root.message === 'object') list = [root.message];
  }

  const normalized: ProWorkflowMessage[] = [];
  for (const item of list) {
    const rec = asRecord(item);
    if (!rec) continue;
    const body =
      asString(rec.content) ||
      asString(rec.message) ||
      asString(rec.body) ||
      asString(rec.text) ||
      asString(rec.comment);
    if (!body) continue;

    const id =
      asNonEmptyId(rec.id) ??
      asNonEmptyId(rec.messageid) ??
      asNonEmptyId(rec.commentid) ??
      `msg-${normalized.length + 1}`;
    const createdAt =
      asString(rec.createdat) ||
      asString(rec.created_at) ||
      asString(rec.date) ||
      asString(rec.timestamp) ||
      undefined;
    const authorObj = asRecord(rec.author) ?? asRecord(rec.contact) ?? asRecord(rec.user);
    const authorName =
      asString(rec.authorname) ||
      asString(rec.authorName) ||
      asString(authorObj?.name) ||
      asString(authorObj?.fullname) ||
      undefined;

    normalized.push({id, body, authorName, createdAt, raw: rec});
  }

  if (normalized.length === 0) return null;

  const sorted = [...normalized].sort((a, b) => {
    const timeA = a.createdAt ? Date.parse(a.createdAt) : Number.NaN;
    const timeB = b.createdAt ? Date.parse(b.createdAt) : Number.NaN;
    if (Number.isFinite(timeA) && Number.isFinite(timeB) && timeA !== timeB) {
      return timeB - timeA;
    }
    const numA = Number(a.id);
    const numB = Number(b.id);
    if (Number.isFinite(numA) && Number.isFinite(numB) && numA !== numB) {
      return numB - numA;
    }
    return 0;
  });

  return sorted[0];
}

export function extractGoogleDriveFileId(rawUrl: string): string | null {
  if (!rawUrl) return null;
  const decoded = decodeHtmlEntities(rawUrl).trim();
  if (!/(drive|docs)\.google\.com/i.test(decoded)) {
    return null;
  }

  const pathMatch = decoded.match(/\/(?:file|document|spreadsheets|presentation)\/d\/([a-zA-Z0-9_-]{10,})/i);
  if (pathMatch?.[1]) return pathMatch[1];

  const genericDMatch = decoded.match(/\/d\/([a-zA-Z0-9_-]{10,})/i);
  if (genericDMatch?.[1]) return genericDMatch[1];

  const queryIdMatch = decoded.match(/[?&]id=([a-zA-Z0-9_-]{10,})/i);
  if (queryIdMatch?.[1]) return queryIdMatch[1];

  return null;
}

function detectKeywordType(text: string): ProducerStatementType | null {
  const match = text.match(/\b(ps1|ps2|ps4)\b/i);
  if (!match?.[1]) return null;
  return match[1].toUpperCase() as ProducerStatementType;
}

export function parseMessageDirectives(
  messageBody: string,
  mentionTrigger = '@review-agent'
): ParsedMessageDirectives {
  const raw = messageBody || '';
  const plainText = stripHtmlToText(raw);
  const triggerNormalized = mentionTrigger.trim().toLowerCase();

  const escapedTrigger = triggerNormalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const triggerRegex = new RegExp(`(?:^|[\\s(>.,;:])${escapedTrigger}(?=$|[\\s)<.,;:!?])`, 'i');
  const hasReviewTrigger = triggerRegex.test(plainText) || triggerRegex.test(raw);

  // Extract all @mentions excluding @review-agent
  const mentionRegex = /(?:^|[\s(>.,;:])(@[a-zA-Z0-9][a-zA-Z0-9._-]*)/g;
  const seenMentions = new Set<string>();
  const taggedEngineers: string[] = [];

  for (const match of plainText.matchAll(mentionRegex)) {
    const mention = match[1].replace(/[.,;:!?]+$/, '');
    const lower = mention.toLowerCase();
    if (lower === triggerNormalized) continue;
    if (!seenMentions.has(lower)) {
      seenMentions.add(lower);
      taggedEngineers.push(mention);
    }
  }

  // Extract hyperlinked PS1 / PS2 / PS4 -> Google Drive File IDs
  const docs: DriveDocumentLink[] = [];
  const seenDocs = new Set<string>();

  const addDocIfValid = (label: string, url: string) => {
    const keywordType = detectKeywordType(label);
    if (!keywordType) return;
    const fileId = extractGoogleDriveFileId(url);
    if (!fileId) return;
    const key = `${keywordType}:${fileId}`;
    if (seenDocs.has(key)) return;
    seenDocs.add(key);
    docs.push({
      keywordType,
      fileId,
      url: decodeHtmlEntities(url).trim(),
      linkLabel: label.trim(),
    });
  };

  // 1) HTML <a href="...">label</a>
  const anchorRegex = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of raw.matchAll(anchorRegex)) {
    const href = match[1];
    const innerText = stripHtmlToText(match[2]);
    addDocIfValid(innerText, href);
  }

  // 2) Markdown [label](url)
  const markdownLinkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi;
  for (const match of plainText.matchAll(markdownLinkRegex)) {
    addDocIfValid(match[1], match[2]);
  }

  // 3) Plain text patterns like "PS1: https://drive.google.com/..." or "PS2 (https://drive.google.com/...)"
  const plainUrlNearKeywordRegex =
    /\b(ps1|ps2|ps4)\b[^\n]{0,40}?(https?:\/\/(?:drive|docs)\.google\.com\/[^\s<>"')]+)/gi;
  for (const match of plainText.matchAll(plainUrlNearKeywordRegex)) {
    addDocIfValid(match[1], match[2]);
  }

  return {
    hasReviewTrigger,
    taggedEngineers,
    driveDocuments: docs,
    plainText,
  };
}

function readCustomFieldValue(fields: unknown, candidateNames: string[]): string {
  const lowered = candidateNames.map((n) => n.toLowerCase());
  if (Array.isArray(fields)) {
    for (const item of fields) {
      const rec = asRecord(item);
      if (!rec) continue;
      const name = (asString(rec.name) || asString(rec.label) || asString(rec.title)).toLowerCase();
      if (lowered.some((target) => name.includes(target))) {
        const value = asString(rec.value) || asString(rec.text);
        if (value) return stripHtmlToText(value);
      }
    }
  } else {
    const obj = asRecord(fields);
    if (obj) {
      for (const [k, v] of Object.entries(obj)) {
        if (lowered.some((target) => k.toLowerCase().includes(target))) {
          const str = asString(v);
          if (str) return stripHtmlToText(str);
        }
      }
    }
  }
  return '';
}

function extractLabeledLine(text: string, labelPattern: string): string {
  if (!text) return '';
  const regex = new RegExp(
    `(?:^|\\n)\\s*(?:[-*•]\\s*)?(?:${labelPattern})\\s*:\\s*([\\s\\S]*?)(?=\\n\\s*[-*•]\\s*[A-Za-z][A-Za-z0-9 /()_-]{1,40}\\s*:|$)`,
    'i'
  );
  const match = text.match(regex);
  return match?.[1] ? match[1].trim() : '';
}

export function splitJobSpecificNotes(rawNotes: string): string[] {
  if (!rawNotes.trim()) return [];
  // Split on explicit newlines or semicolon/bullet boundaries while keeping meaningful lines intact
  const lines = rawNotes
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*•]\s*/, '').trim())
    .filter(Boolean);
  return lines;
}

export function extractProjectContext(
  projectPayload: unknown,
  fallbackProjectId: string,
  extraNotesPayload?: unknown
): ExtractedProjectContext {
  const root = asRecord(projectPayload) ?? {};
  const projectObj = asRecord(root.project) ?? asRecord(root.data) ?? root;

  const projectId =
    asNonEmptyId(projectObj.id) ??
    asNonEmptyId(projectObj.projectid) ??
    fallbackProjectId;

  const rawTitle =
    asString(projectObj.title) ||
    asString(projectObj.name) ||
    asString(projectObj.projectname);

  let projectNumber =
    asString(projectObj.number) ||
    asString(projectObj.projectnumber) ||
    asString(projectObj.code);

  let projectTitle = rawTitle;
  const headerSplit = rawTitle.match(/^([A-Z0-9-]{4,})\s*[-–—]\s*(.+)$/i);
  if (headerSplit) {
    if (!projectNumber) projectNumber = headerSplit[1].trim();
    projectTitle = headerSplit[2].trim();
  }

  // Gather all note/description text blocks (including Private Notes / Notes for Delivery)
  const noteCandidates: string[] = [];
  for (const field of [
    projectObj.privatenotes,
    projectObj.privateNotes,
    projectObj.private_notes,
    projectObj.notes,
    projectObj.notesfordelivery,
    projectObj.description,
    projectObj.summary,
  ]) {
    const str = asString(field);
    if (str) noteCandidates.push(stripHtmlToText(str));
  }

  if (extraNotesPayload) {
    if (typeof extraNotesPayload === 'string') {
      noteCandidates.push(stripHtmlToText(extraNotesPayload));
    } else if (Array.isArray(extraNotesPayload)) {
      for (const n of extraNotesPayload) {
        const rec = asRecord(n);
        if (!rec) continue;
        const txt = asString(rec.content) || asString(rec.note) || asString(rec.body) || asString(rec.text);
        if (txt) noteCandidates.push(stripHtmlToText(txt));
      }
    } else {
      const extraRec = asRecord(extraNotesPayload);
      if (extraRec) {
        for (const key of ['notes', 'data', 'items', 'privatenotes']) {
          const val = extraRec[key];
          if (Array.isArray(val)) {
            for (const n of val) {
              const rec = asRecord(n);
              if (!rec) continue;
              const txt =
                asString(rec.content) || asString(rec.note) || asString(rec.body) || asString(rec.text);
              if (txt) noteCandidates.push(stripHtmlToText(txt));
            }
          } else if (typeof val === 'string' && val.trim()) {
            noteCandidates.push(stripHtmlToText(val));
          }
        }
      }
    }
  }

  const combinedNotesText = noteCandidates.join('\n');

  const customFields = projectObj.customfields ?? projectObj.customFields ?? projectObj.fields;

  const addressFromFields =
    asString(projectObj.address) ||
    asString(projectObj.location) ||
    readCustomFieldValue(customFields, ['project address', 'address', 'location']);

  const addressFromNotes = extractLabeledLine(
    combinedNotesText,
    'Project\\s+address|Site\\s+address|Address|Location'
  );

  const addressLocation = addressFromFields || addressFromNotes;

  const jobNotesFromFields =
    asString(projectObj.jobspecificnotes) ||
    asString(projectObj.jobSpecificNotes) ||
    readCustomFieldValue(customFields, ['job specific notes', 'job notes']);

  const jobNotesFromNotes = extractLabeledLine(
    combinedNotesText,
    'Job\\s+Specific\\s+Notes?'
  );

  const jobSpecificNotesRaw = jobNotesFromFields || jobNotesFromNotes;

  return {
    projectId,
    projectNumber,
    projectTitle,
    addressLocation,
    jobSpecificNotesRaw,
    jobSpecificNotesList: splitJobSpecificNotes(jobSpecificNotesRaw),
  };
}
