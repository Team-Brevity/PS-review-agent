import {getConfigReadiness} from '@/features/config/env';
import DashboardShell from '@/features/dashboard/DashboardShell';
import {listReviewRuns} from '@/features/review-pipeline/review.store';

export const dynamic = 'force-dynamic';

export default function HomePage() {
  const initialData = {
    runs: listReviewRuns(),
    config: getConfigReadiness(),
  };

  return <DashboardShell initialData={initialData} />;
}
