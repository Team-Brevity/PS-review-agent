'use client';

import {RefreshCw} from 'lucide-react';
import {motion} from 'motion/react';
import {useCallback, useEffect, useState} from 'react';
import type {ConfigReadiness} from '../config/env';
import type {ReviewRunRecord} from '../review-pipeline/review.store';
import ConfigurationView from './ConfigurationView';
import type {DashboardInitialData, DashboardTab} from './dashboard.types';
import RunsMonitorView from './RunsMonitorView';
import WorkbenchView from './WorkbenchView';

export default function DashboardShell({initialData}: {initialData: DashboardInitialData}) {
  const [activeTab, setActiveTab] = useState<DashboardTab>('runs');
  const [runs, setRuns] = useState<ReviewRunRecord[]>(initialData.runs);
  const [config, setConfig] = useState<ConfigReadiness>(initialData.config);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refreshData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch('/api/reviews', {cache: 'no-store'});
      if (!res.ok) return;
      const data = (await res.json()) as {
        runs: ReviewRunRecord[];
        config: ConfigReadiness;
      };
      setRuns(data.runs);
      setConfig(data.config);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  const hasActiveJobs = runs.some((r) => r.status === 'queued' || r.status === 'running');

  useEffect(() => {
    if (!hasActiveJobs) return;
    const timer = setInterval(() => {
      void refreshData();
    }, 1500);
    return () => clearInterval(timer);
  }, [hasActiveJobs, refreshData]);

  const handleWebhookDispatched = useCallback(() => {
    void refreshData();
    setTimeout(() => {
      void refreshData();
    }, 600);
  }, [refreshData]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Three-zone Top Navigation Bar (single-row on md+, responsive nav row on mobile) */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4 md:gap-8">
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('runs');
            }}
            className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            PS Review Agent
          </a>

          <nav aria-label="Primary workspace navigation" className="hidden md:flex items-center gap-6">
            {(
              [
                {id: 'runs', label: 'Pipeline Runs'},
                {id: 'workbench', label: 'Parser Workbench'},
                {id: 'config', label: 'Endpoint Spec'},
              ] as const
            ).map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-1 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'border-slate-900 text-slate-900'
                      : 'border-transparent text-slate-500 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => void refreshData()}
              disabled={isRefreshing}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              Refresh Runs
            </button>
          </div>
        </div>

        <nav
          aria-label="Mobile workspace navigation"
          className="md:hidden border-t border-slate-100 px-4 flex items-center gap-5 overflow-x-auto"
        >
          {(
            [
              {id: 'runs', label: 'Pipeline Runs'},
              {id: 'workbench', label: 'Parser Workbench'},
              {id: 'config', label: 'Endpoint Spec'},
            ] as const
          ).map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'border-slate-900 text-slate-900'
                    : 'border-transparent text-slate-500 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>
      </header>

      {/* Main Content */}
      <main id="top" className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <section className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-slate-200">
          <div className="space-y-1.5 max-w-2xl">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 [text-wrap:balance]">
              ProWorkflow Engineering Producer Statement Review
            </h1>
            <p className="text-sm text-slate-600">
              Non-blocking <span className="font-mono text-slate-800">edittask</span> webhook backend verifying{' '}
              <span className="font-mono text-slate-800">PS1</span>,{' '}
              <span className="font-mono text-slate-800">PS2</span>, and{' '}
              <span className="font-mono text-slate-800">PS4</span> Drive PDFs against ProWorkflow project context with Gemini.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
            <span>Model: <span className="font-mono text-slate-800">{config.geminiModel}</span></span>
            <span aria-hidden="true">·</span>
            <span>Tag: <span className="font-mono text-slate-800">{config.reviewTag}</span></span>
            <span aria-hidden="true">·</span>
            <span>Concurrency: <span className="font-mono tabular-nums text-slate-800">{config.maxConcurrentReviews}</span></span>
          </div>
        </section>

        <motion.div
          key={activeTab}
          initial={{opacity: 0, y: 4}}
          animate={{opacity: 1, y: 0}}
          transition={{duration: 0.16, ease: [0.16, 1, 0.3, 1]}}
        >
          {activeTab === 'runs' && (
            <RunsMonitorView
              runs={runs}
              isLoading={isRefreshing}
              onOpenWorkbench={() => setActiveTab('workbench')}
            />
          )}
          {activeTab === 'workbench' && (
            <WorkbenchView
              onWebhookDispatched={handleWebhookDispatched}
              onViewRuns={() => setActiveTab('runs')}
            />
          )}
          {activeTab === 'config' && <ConfigurationView config={config} />}
        </motion.div>
      </main>
    </div>
  );
}
