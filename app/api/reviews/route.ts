import {NextResponse} from 'next/server';
import {getConfigReadiness} from '@/features/config/env';
import {listReviewRuns} from '@/features/review-pipeline/review.store';

export async function GET() {
  return NextResponse.json({
    runs: listReviewRuns(),
    config: getConfigReadiness(),
  });
}
