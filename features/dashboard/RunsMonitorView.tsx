'use client';

import {AlertCircle, CheckCircle2, Clock, FileText, HelpCircle, Play, XCircle} from 'lucide-react';
import {useMemo, useState} from 'react';
import type {ReviewRunRecord, ReviewRunStatus} from '../review-pipeline/review.store';

interface RunsMonitorViewProps {
  runs: ReviewRunRecord[];
  isLoading: boolean;
  onOpenWorkbench: () => void;
}

type StatusFilter = 'all' | 'completed' | 'skipped' | 'failed';

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function getStatusDisplay(status: ReviewRunStatus): {
  label: string;
  toneClass: string;
  Icon: typeof CheckCircle2;
} {
  switch (status) {
    case 'completed':
      return {label: 'Completed', toneClass: 'text-emerald-700', Icon: CheckCircle2};
    case 'running':
      return {label: 'Running', toneClass: 'text-sky-700', Icon: Clock};
    case 'queued':
      return {label: 'Queued', toneClass: 'text-slate-700', Icon: Clock};
    case 'skipped_tag':
      return {label: 'Skipped (Tag)', toneClass: 'text-amber-700', Icon: HelpCircle};
    case 'skipped_no_mention':
      return {label: 'Skipped (No Mention)', toneClass: 'text-amber-700', Icon: HelpCircle};
    case 'skipped_no_files':
      return {label: 'Skipped (No PS Link)', toneClass: 'text-amber-700', Icon: HelpCircle};
    case 'skipped_duplicate':
      return {label: 'Skipped (Duplicate)', toneClass: 'text-slate-600', Icon: HelpCircle};
    case 'failed':
      return {label: 'Failed', toneClass: 'text-red-700', Icon: XCircle};
  }
}

export default function RunsMonitorView({
  runs,
  isLoading,
  onOpenWorkbench,
}: RunsMonitorViewProps) {
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRunId, setSelectedRunId] = useState<string | null>(runs[0]?.id ?? null);

  const counts = useMemo(() => {
    let completed = 0;
    let skipped = 0;
    let failed = 0;
    for (const run of runs) {
      if (run.status === 'completed') completed += 1;
      else if (run.status === 'failed') failed += 1;
      else if (run.status.startsWith('skipped_')) skipped += 1;
    }
    return {total: runs.length, completed, skipped, failed};
  }, [runs]);

  const filteredRuns = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return runs.filter((run) => {
      if (filter === 'completed' && run.status !== 'completed') return false;
      if (filter === 'failed' && run.status !== 'failed') return false;
      if (filter === 'skipped' && !run.status.startsWith('skipped_')) return false;
      if (!query) return true;
      return (
        run.taskId.toLowerCase().includes(query) ||
        (run.projectId || '').toLowerCase().includes(query) ||
        (run.projectNumber || '').toLowerCase().includes(query) ||
        (run.projectTitle || '').toLowerCase().includes(query)
      );
    });
  }, [runs, filter, searchQuery]);

  const selectedRun = useMemo(() => {
    if (filteredRuns.length === 0) return null;
    return filteredRuns.find((r) => r.id === selectedRunId) ?? filteredRuns[0];
  }, [filteredRuns, selectedRunId]);

  return (
    <div className="space-y-6">
      {/* Summary metrics strip */}
      <section aria-label="Webhook run summary" className="grid grid-cols-2 lg:grid-cols-4 border border-slate-200 bg-white rounded-lg divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
        <div className="p-4">
          <p className="text-xs font-medium text-slate-500">Total Webhook Events</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900 font-mono tabular-nums">
            {counts.total}
          </p>
        </div>
        <div className="p-4">
          <p className="text-xs font-medium text-slate-500">Reviews Posted</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-700 font-mono tabular-nums">
            {counts.completed}
          </p>
        </div>
        <div className="p-4">
          <p className="text-xs font-medium text-slate-500">Gracefully Skipped</p>
          <p className="mt-1 text-2xl font-semibold text-amber-700 font-mono tabular-nums">
            {counts.skipped}
          </p>
        </div>
        <div className="p-4">
          <p className="text-xs font-medium text-slate-500">Failed Executions</p>
          <p className="mt-1 text-2xl font-semibold text-red-700 font-mono tabular-nums">
            {counts.failed}
          </p>
        </div>
      </section>

      {/* Filter toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div
          role="tablist"
          aria-label="Filter webhook runs by outcome"
          className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start"
        >
          {(
            [
              {id: 'all', label: 'All Runs'},
              {id: 'completed', label: 'Completed'},
              {id: 'skipped', label: 'Skipped'},
              {id: 'failed', label: 'Failed'},
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={filter === item.id}
              onClick={() => setFilter(item.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                filter === item.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="w-full sm:w-72">
          <label htmlFor="run-search" className="sr-only">
            Search by task ID or project
          </label>
          <input
            id="run-search"
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter by task ID or project..."
            className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400"
          />
        </div>
      </div>

      {/* Main split: table + execution inspector */}
      {isLoading && runs.length === 0 ? (
        <div className="border border-slate-200 bg-white rounded-lg p-6 space-y-3" aria-busy="true">
          <div className="h-4 w-48 bg-slate-100 rounded" />
          <div className="h-10 w-full bg-slate-100 rounded" />
          <div className="h-10 w-full bg-slate-100 rounded" />
          <div className="h-10 w-full bg-slate-100 rounded" />
        </div>
      ) : filteredRuns.length === 0 ? (
        <div className="border border-slate-200 bg-white rounded-lg p-12 text-center">
          <FileText className="w-8 h-8 text-slate-400 mx-auto" aria-hidden="true" />
          <h2 className="mt-4 text-base font-semibold text-slate-900">
            {runs.length === 0
              ? 'No ProWorkflow webhook events received yet'
              : 'No matching webhook runs'}
          </h2>
          <p className="mt-2 text-sm text-slate-600 max-w-md mx-auto">
            {runs.length === 0
              ? 'Configure your ProWorkflow edittask webhook to POST to /api/webhooks/proworkflow, or test the pipeline directly in the Parser & Workbench tab.'
              : 'Adjust your status filter or search query to inspect earlier executions.'}
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            {runs.length === 0 ? (
              <button
                type="button"
                onClick={onOpenWorkbench}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
              >
                <Play className="w-4 h-4" aria-hidden="true" />
                Open Parser & Workbench
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setFilter('all');
                  setSearchQuery('');
                }}
                className="px-4 py-2 text-sm font-medium text-slate-900 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Runs table */}
          <div className="xl:col-span-7 border border-slate-200 bg-white rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                    <th className="py-2.5 px-4">Task ID</th>
                    <th className="py-2.5 px-4">Project</th>
                    <th className="py-2.5 px-4">Outcome</th>
                    <th className="py-2.5 px-4 text-right">Files</th>
                    <th className="py-2.5 px-4 text-right">Received</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {filteredRuns.map((run) => {
                    const statusInfo = getStatusDisplay(run.status);
                    const StatusIcon = statusInfo.Icon;
                    const isSelected = selectedRun?.id === run.id;
                    return (
                      <tr
                        key={run.id}
                        onClick={() => setSelectedRunId(run.id)}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-slate-100/80' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="py-2.5 px-4 font-mono tabular-nums font-medium text-slate-900 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setSelectedRunId(run.id)}
                            className="text-left hover:underline focus-visible:outline-none focus-visible:underline"
                          >
                            #{run.taskId}
                          </button>
                        </td>
                        <td className="py-2.5 px-4 text-slate-700 max-w-[220px] truncate">
                          {run.projectNumber || run.projectTitle
                            ? `${run.projectNumber ? `${run.projectNumber} · ` : ''}${run.projectTitle || ''}`
                            : run.projectId
                              ? `Project #${run.projectId}`
                              : 'Pending lookup'}
                        </td>
                        <td className="py-2.5 px-4 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${statusInfo.toneClass}`}>
                            <StatusIcon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                            <span>{statusInfo.label}</span>
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700">
                          {run.documents.length}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-xs text-slate-500 whitespace-nowrap">
                          {formatTimestamp(run.createdAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Detail pane */}
          {selectedRun && (
            <aside
              aria-label={`Details for task ${selectedRun.taskId}`}
              className="xl:col-span-5 border border-slate-200 bg-white rounded-lg p-5 space-y-5"
            >
              <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200">
                <div>
                  <p className="text-xs font-medium text-slate-500">Execution Trace</p>
                  <h2 className="mt-1 text-base font-semibold text-slate-900 font-mono tabular-nums">
                    Task #{selectedRun.taskId}
                    {selectedRun.projectId ? ` · Project #${selectedRun.projectId}` : ''}
                  </h2>
                </div>
                <span
                  className={`text-xs font-medium whitespace-nowrap ${
                    getStatusDisplay(selectedRun.status).toneClass
                  }`}
                >
                  {getStatusDisplay(selectedRun.status).label}
                </span>
              </div>

              {(selectedRun.reason || selectedRun.error) && (
                <div
                  className={`p-3 rounded-md border text-xs leading-relaxed ${
                    selectedRun.error
                      ? 'bg-red-50 border-red-200 text-red-900'
                      : 'bg-amber-50 border-amber-200 text-amber-900'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                    <span>{selectedRun.error || selectedRun.reason}</span>
                  </div>
                </div>
              )}

              <div>
                <h3 className="text-xs font-semibold text-slate-700 mb-2">Pipeline Steps</h3>
                <ol className="space-y-2 border-t border-slate-100 pt-2">
                  {selectedRun.steps.map((step, index) => (
                    <li key={`${step.timestamp}-${index}`} className="text-xs flex items-start gap-3">
                      <span className="font-mono tabular-nums text-slate-400 shrink-0 w-16">
                        {formatTimestamp(step.timestamp).split(' ').pop()}
                      </span>
                      <div className="min-w-0">
                        <span className="font-medium text-slate-800">{step.step}</span>
                        <p className="text-slate-600 break-words">{step.detail}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>

              {selectedRun.documents.length > 0 && (
                <div className="pt-4 border-t border-slate-200 space-y-4">
                  <h3 className="text-xs font-semibold text-slate-700">
                    Posted ProWorkflow Replies ({selectedRun.documents.length})
                  </h3>
                  {selectedRun.documents.map((doc) => (
                    <div key={`${doc.keywordType}-${doc.fileId}`} className="space-y-2">
                      <div className="flex items-center justify-between text-xs text-slate-600">
                        <span className="font-medium text-slate-900">
                          {doc.fileName} · {doc.keywordType}
                        </span>
                        <span className="font-mono tabular-nums text-slate-500">
                          {doc.fileId.slice(0, 12)}...
                        </span>
                      </div>
                      <pre className="p-3 bg-slate-50 border border-slate-200 rounded-md text-xs font-mono text-slate-800 whitespace-pre-wrap break-words">
                        {doc.formattedMessage}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </aside>
          )}
        </div>
      )}
    </div>
  );
}
