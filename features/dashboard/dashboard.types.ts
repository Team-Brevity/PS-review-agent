import type {ConfigReadiness} from '../config/env';
import type {ReviewRunRecord} from '../review-pipeline/review.store';

export interface DashboardInitialData {
  runs: ReviewRunRecord[];
  config: ConfigReadiness;
}

export type DashboardTab = 'runs' | 'workbench' | 'config';
