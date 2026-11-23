import {NextResponse} from 'next/server';

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'proworkflow-ps-review-agent',
    timestamp: new Date().toISOString(),
  });
}
