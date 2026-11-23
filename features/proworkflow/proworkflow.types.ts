import type {ProducerStatementType} from './proworkflow.config';

export interface ProWorkflowWebhookIds {
  event: string;
  taskId: string;
  projectId: string | null;
}

export interface ProWorkflowTag {
  id?: string | number;
  name?: string;
  title?: string;
  label?: string;
}

export interface ProWorkflowTask {
  id: string;
  title?: string;
  name?: string;
  projectId: string | null;
  tags: string[];
  raw: Record<string, unknown>;
}

export interface ProWorkflowMessage {
  id: string;
  body: string;
  authorName?: string;
  createdAt?: string;
  raw: Record<string, unknown>;
}

export interface DriveDocumentLink {
  keywordType: ProducerStatementType;
  fileId: string;
  url: string;
  linkLabel: string;
}

export interface ParsedMessageDirectives {
  hasReviewTrigger: boolean;
  taggedEngineers: string[];
  driveDocuments: DriveDocumentLink[];
  plainText: string;
}

export interface ExtractedProjectContext {
  projectId: string;
  projectNumber: string;
  projectTitle: string;
  addressLocation: string;
  jobSpecificNotesRaw: string;
  jobSpecificNotesList: string[];
}
