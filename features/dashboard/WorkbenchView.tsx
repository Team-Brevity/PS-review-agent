'use client';

import {CheckCircle2, Play, Send} from 'lucide-react';
import {useCallback, useEffect, useState} from 'react';
import type {
  ExtractedProjectContext,
  ParsedMessageDirectives,
  ProWorkflowWebhookIds,
} from '../proworkflow/proworkflow.types';

interface InspectResponse {
  webhookIds: ProWorkflowWebhookIds | null;
  webhookParseError: string | null;
  messageDirectives: ParsedMessageDirectives;
  projectContext: ExtractedProjectContext;
  userPrompt: string;
  formattedReply: string | null;
  geminiParseError: string | null;
}

interface WorkbenchViewProps {
  onWebhookDispatched: () => void;
  onViewRuns: () => void;
}

const DEFAULT_WEBHOOK_JSON = JSON.stringify(
  {
    event: 'edittask',
    taskid: '482910',
    projectid: '26093887',
  },
  null,
  2
);

const DEFAULT_MESSAGE_HTML = `<p>Hi @review-agent, please run a second-pass check on the attached <a href="https://drive.google.com/file/d/1WaipapaPs1ExampleFileId991/view?usp=sharing">PS1</a> and <a href="https://drive.google.com/open?id=1WaipapaPs2ExampleFileId442">PS2</a> documents.</p>
<p>Tagging @Georgia.Periam and @Niko.Peiris for final engineering sign-off.</p>`;

const DEFAULT_PROJECT_TITLE = '26093887 - Design of Storage Racking for Waipapa Farm Source';

const DEFAULT_PROJECT_NOTES = `Notes for Delivery:
- Project Won: November 16 2026 15:41:13
- Service Level: Best Value
- Client Status: Existing Client
- Project address: 1913 State Highway 10, Waipapa, New Zealand
- Importance Level:
- BCN:
- Job Specific Notes: PS1 on the below bays in red? Bays A-G All x7 Bays will be 3500H x 2700L x 900Dmm using 120mm beams – looking for a 2400KG beam level rating Address: 1913 State Highway 10, Waipapa 0230
- Client Specific Notes: Anchor preference: Rawlplug screw, then Hilti HUS4, then Rawlplug expansion`;

const DEFAULT_SAMPLE_GEMINI_JSON = JSON.stringify(
  {
    confirmed_flags: [
      "client name incorrect on page 2 (TO field shows 'Waipapa Rural Ltd', page 4 drawings after Element schedule show 'Waipapa Farm Source')",
      "job specific note '2400KG beam level rating' missing from Element Schedule on page 3",
    ],
    unclear: [
      'project number unclear on page 1 (last two digits partially obscured by header border)',
    ],
    verified_correct: [
      'address/location: verified (1913 State Highway 10, Waipapa, New Zealand)',
      "job specific note 'Bays A-G All x7 Bays 3500H x 2700L x 900Dmm using 120mm beams': verified",
    ],
  },
  null,
  2
);

export default function WorkbenchView({
  onWebhookDispatched,
  onViewRuns,
}: WorkbenchViewProps) {
  const [webhookPayloadJson, setWebhookPayloadJson] = useState(DEFAULT_WEBHOOK_JSON);
  const [messageHtml, setMessageHtml] = useState(DEFAULT_MESSAGE_HTML);
  const [projectTitle, setProjectTitle] = useState(DEFAULT_PROJECT_TITLE);
  const [projectNotesText, setProjectNotesText] = useState(DEFAULT_PROJECT_NOTES);
  const [sampleGeminiJson, setSampleGeminiJson] = useState(DEFAULT_SAMPLE_GEMINI_JSON);

  const [inspectResult, setInspectResult] = useState<InspectResponse | null>(null);
  const [inspectError, setInspectError] = useState<string | null>(null);
  const [isInspecting, setIsInspecting] = useState(false);

  const [dispatchStatus, setDispatchStatus] = useState<string | null>(null);
  const [dispatchError, setDispatchError] = useState<string | null>(null);
  const [isDispatching, setIsDispatching] = useState(false);

  const performInspect = useCallback(async () => {
    const res = await fetch('/api/reviews/inspect', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        webhookPayloadJson,
        messageHtml,
        projectTitle,
        projectNotesText,
        sampleGeminiJson,
        sampleFileName: 'Waipapa_Farm_Source_Racking.pdf',
      }),
    });
    const data = (await res.json()) as InspectResponse & {error?: string};
    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return data;
  }, [webhookPayloadJson, messageHtml, projectTitle, projectNotesText, sampleGeminiJson]);

  const runInspect = useCallback(async () => {
    setIsInspecting(true);
    setInspectError(null);
    try {
      const data = await performInspect();
      setInspectResult(data);
    } catch (err) {
      setInspectError(err instanceof Error ? err.message : 'Inspection failed');
    } finally {
      setIsInspecting(false);
    }
  }, [performInspect]);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      performInspect()
        .then((data) => {
          if (active) {
            setInspectResult(data);
            setInspectError(null);
          }
        })
        .catch((err) => {
          if (active) {
            setInspectError(err instanceof Error ? err.message : 'Inspection failed');
          }
        });
    }, 50);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [performInspect]);

  const handleDispatchWebhook = async () => {
    setIsDispatching(true);
    setDispatchStatus(null);
    setDispatchError(null);
    try {
      const parsedBody = JSON.parse(webhookPayloadJson) as unknown;
      const res = await fetch('/api/webhooks/proworkflow', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(parsedBody),
      });
      const data = (await res.json()) as {
        runId?: string;
        taskId?: string;
        projectId?: string | null;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setDispatchStatus(
        `HTTP 200 OK · Queued non-awaited task #${data.taskId} (${data.runId})`
      );
      onWebhookDispatched();
    } catch (err) {
      setDispatchError(err instanceof Error ? err.message : 'Webhook dispatch failed');
    } finally {
      setIsDispatching(false);
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
      {/* Left column: inputs */}
      <section className="xl:col-span-6 border border-slate-200 bg-white rounded-lg p-5 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              ProWorkflow Input Workbench
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Test webhook extraction, Drive File ID regexes, Private Notes parsing, and reply formatting.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={runInspect}
              disabled={isInspecting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-900 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
            >
              <Play className="w-3.5 h-3.5" aria-hidden="true" />
              {isInspecting ? 'Inspecting...' : 'Inspect & Preview'}
            </button>
            <button
              type="button"
              onClick={handleDispatchWebhook}
              disabled={isDispatching}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
            >
              <Send className="w-3.5 h-3.5" aria-hidden="true" />
              {isDispatching ? 'Sending...' : 'Send edittask Webhook'}
            </button>
          </div>
        </div>

        {dispatchStatus && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-md text-xs text-emerald-900 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span className="font-mono break-all">{dispatchStatus}</span>
            </div>
            <button
              type="button"
              onClick={onViewRuns}
              className="text-xs font-semibold text-emerald-900 underline hover:no-underline whitespace-nowrap shrink-0"
            >
              View in Pipeline Runs
            </button>
          </div>
        )}
        {dispatchError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-900">
            {dispatchError}
          </div>
        )}
        {inspectError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-900">
            {inspectError}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label htmlFor="wb-webhook-json" className="block text-xs font-medium text-slate-700 mb-1.5">
              1. Webhook Payload JSON (edittask)
            </label>
            <textarea
              id="wb-webhook-json"
              rows={4}
              value={webhookPayloadJson}
              onChange={(e) => setWebhookPayloadJson(e.target.value)}
              className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400"
            />
          </div>

          <div>
            <label htmlFor="wb-message-html" className="block text-xs font-medium text-slate-700 mb-1.5">
              2. Latest ProWorkflow Task Message (HTML / Text with @review-agent &amp; PS links)
            </label>
            <textarea
              id="wb-message-html"
              rows={4}
              value={messageHtml}
              onChange={(e) => setMessageHtml(e.target.value)}
              className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400"
            />
          </div>

          <div>
            <label htmlFor="wb-project-title" className="block text-xs font-medium text-slate-700 mb-1.5">
              3. ProWorkflow Project Header / Title
            </label>
            <input
              id="wb-project-title"
              type="text"
              value={projectTitle}
              onChange={(e) => setProjectTitle(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400"
            />
          </div>

          <div>
            <label htmlFor="wb-project-notes" className="block text-xs font-medium text-slate-700 mb-1.5">
              4. ProWorkflow Private Notes (Notes for Delivery)
            </label>
            <textarea
              id="wb-project-notes"
              rows={6}
              value={projectNotesText}
              onChange={(e) => setProjectNotesText(e.target.value)}
              className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400"
            />
          </div>

          <div>
            <label htmlFor="wb-gemini-json" className="block text-xs font-medium text-slate-700 mb-1.5">
              5. Gemini Structured JSON Response (Formatter Preview)
            </label>
            <textarea
              id="wb-gemini-json"
              rows={7}
              value={sampleGeminiJson}
              onChange={(e) => setSampleGeminiJson(e.target.value)}
              className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400"
            />
          </div>
        </div>
      </section>

      {/* Right column: extracted output */}
      <section className="xl:col-span-6 border border-slate-200 bg-white rounded-lg p-5 space-y-5">
        <div className="pb-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">
            Extracted Context &amp; ProWorkflow Reply Preview
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Live output from the pure ProWorkflow parser, Drive ID extractor, and Gemini message formatter.
          </p>
        </div>

        {inspectResult ? (
          <div className="space-y-5">
            {/* Parsed Identifiers */}
            <div className="grid grid-cols-1 sm:grid-cols-2 border-y border-slate-200 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 text-xs">
              <div className="py-3 sm:pr-4 space-y-1">
                <p className="font-medium text-slate-500">Webhook Task &amp; Project</p>
                {inspectResult.webhookParseError ? (
                  <p className="text-red-700">{inspectResult.webhookParseError}</p>
                ) : (
                  <p className="font-mono tabular-nums text-slate-900">
                    event: {inspectResult.webhookIds?.event} · task: #{inspectResult.webhookIds?.taskId} · project:{' '}
                    {inspectResult.webhookIds?.projectId ? `#${inspectResult.webhookIds.projectId}` : 'lookup via task'}
                  </p>
                )}
              </div>

              <div className="py-3 sm:pl-4 space-y-1">
                <p className="font-medium text-slate-500">Message Directives</p>
                <p className="text-slate-900">
                  Trigger:{' '}
                  <span className="font-medium">
                    {inspectResult.messageDirectives.hasReviewTrigger ? 'Detected (@review-agent)' : 'Missing'}
                  </span>
                </p>
                <p className="text-slate-700">
                  Engineers:{' '}
                  <span className="font-mono">
                    {inspectResult.messageDirectives.taggedEngineers.join(' ') || 'None'}
                  </span>
                </p>
              </div>
            </div>

            {/* Extracted Drive Links */}
            <div>
              <h3 className="text-xs font-semibold text-slate-700 mb-2">
                Extracted Google Drive Documents ({inspectResult.messageDirectives.driveDocuments.length})
              </h3>
              {inspectResult.messageDirectives.driveDocuments.length === 0 ? (
                <p className="text-xs text-amber-700">
                  No hyperlinked Google Drive URLs matched keywords [ps1, ps2, ps4].
                </p>
              ) : (
                <div className="border border-slate-200 rounded-md overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                        <th className="py-2 px-3">Type</th>
                        <th className="py-2 px-3">Link Label</th>
                        <th className="py-2 px-3">Extracted Drive File ID</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {inspectResult.messageDirectives.driveDocuments.map((doc) => (
                        <tr key={`${doc.keywordType}-${doc.fileId}`}>
                          <td className="py-2 px-3 font-mono font-semibold text-slate-900">
                            {doc.keywordType}
                          </td>
                          <td className="py-2 px-3 text-slate-700">{doc.linkLabel}</td>
                          <td className="py-2 px-3 font-mono text-slate-800">{doc.fileId}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Project Info sent to Gemini */}
            <div>
              <h3 className="text-xs font-semibold text-slate-700 mb-2">
                Constructed Gemini User Prompt
              </h3>
              <pre className="p-3 bg-slate-50 border border-slate-200 rounded-md text-xs font-mono text-slate-800 whitespace-pre-wrap break-words">
                {inspectResult.userPrompt}
              </pre>
            </div>

            {/* Final formatted message posted back to ProWorkflow */}
            <div>
              <h3 className="text-xs font-semibold text-slate-700 mb-2">
                Formatted ProWorkflow Thread Message
              </h3>
              {inspectResult.geminiParseError ? (
                <p className="text-xs text-red-700">{inspectResult.geminiParseError}</p>
              ) : (
                <pre className="p-3.5 bg-slate-900 text-slate-100 rounded-md text-xs font-mono whitespace-pre-wrap break-words">
                  {inspectResult.formattedReply}
                </pre>
              )}
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-500">Loading inspection preview...</p>
        )}
      </section>
    </div>
  );
}
