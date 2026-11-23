import type {ProducerStatementType} from '../proworkflow/proworkflow.config';
import type {ExtractedProjectContext} from '../proworkflow/proworkflow.types';

export interface GeminiReviewResult {
  confirmed_flags: string[];
  unclear: string[];
  verified_correct: string[];
}

export interface ReviewDocumentInput {
  projectContext: ExtractedProjectContext;
  keywordType: ProducerStatementType;
  fileUri: string;
  mimeType: string;
  fileName: string;
}

export interface GeminiReviewGateway {
  reviewDocument(input: ReviewDocumentInput): Promise<GeminiReviewResult>;
}
