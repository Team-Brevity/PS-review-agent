'use client';

import {Check, Copy} from 'lucide-react';
import {useState} from 'react';
import type {ConfigReadiness} from '../config/env';
import {ENGINEERING_REVIEW_SYSTEM_PROMPT} from '../gemini-review/gemini-review.prompt';

interface ConfigurationViewProps {
  config: ConfigReadiness;
}

export default function ConfigurationView({config}: ConfigurationViewProps) {
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  const webhookPath = '/api/webhooks/proworkflow';

  const handleCopyWebhook = async () => {
    const fullUrl =
      typeof window !== 'undefined'
        ? `${window.location.origin}${webhookPath}`
        : webhookPath;
    await navigator.clipboard.writeText(fullUrl);
    setCopiedWebhook(true);
    setTimeout(() => setCopiedWebhook(false), 1800);
  };

  const readinessRows = [
    {
      name: 'GEMINI_API_KEY',
      purpose: 'Server-side Gemini review calls via @google/genai',
      configured: config.geminiApiKeyConfigured,
    },
    {
      name: 'PROWORKFLOW_API_KEY',
      purpose: 'Fetch task tags, task messages, project details, and post thread replies',
      configured: config.proworkflowApiKeyConfigured,
    },
    {
      name: 'DRIVE_TO_GEMINI_WEBHOOK_SECRET',
      purpose: 'Authenticated POST body secret for Drive-to-Gemini Apps Script uploader',
      configured: config.driveUploadSecretConfigured,
    },
    {
      name: 'PROWORKFLOW_WEBHOOK_SECRET',
      purpose: 'Optional shared secret header check on incoming edittask webhooks',
      configured: config.proworkflowWebhookSecretConfigured,
    },
  ];

  const routeVariables = [
    {key: 'PROWORKFLOW_API_BASE_URL', value: config.proworkflowApiBaseUrl},
    {key: 'PROWORKFLOW_TASK_PATH', value: config.routes.taskPathTemplate},
    {key: 'PROWORKFLOW_TASK_MESSAGES_PATH', value: config.routes.taskMessagesPathTemplate},
    {key: 'PROWORKFLOW_POST_TASK_MESSAGE_PATH', value: config.routes.postTaskMessagePathTemplate},
    {key: 'PROWORKFLOW_PROJECT_PATH', value: config.routes.projectPathTemplate},
    {key: 'PROWORKFLOW_PROJECT_NOTES_PATH', value: config.routes.projectNotesPathTemplate},
    {key: 'DRIVE_TO_GEMINI_UPLOAD_URL', value: config.driveUploadEndpointUrl},
    {key: 'GEMINI_MODEL', value: config.geminiModel},
    {key: 'PROWORKFLOW_REVIEW_TAG', value: config.reviewTag},
    {key: 'PROWORKFLOW_MENTION_TRIGGER', value: config.mentionTrigger},
    {key: 'MAX_CONCURRENT_REVIEWS', value: String(config.maxConcurrentReviews)},
  ];

  return (
    <div className="space-y-6">
      {/* Webhook Endpoint Card */}
      <section className="border border-slate-200 bg-white rounded-lg p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              ProWorkflow Webhook Receiver
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Register this endpoint in ProWorkflow for the <span className="font-mono text-slate-800">edittask</span> trigger. It dispatches a non-awaited async pipeline and responds HTTP 200 immediately.
            </p>
          </div>
          <button
            type="button"
            onClick={handleCopyWebhook}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-900 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 self-start"
          >
            {copiedWebhook ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
                Copied URL
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                Copy Webhook URL
              </>
            )}
          </button>
        </div>

        <div className="p-3 bg-slate-50 border border-slate-200 rounded-md font-mono text-xs text-slate-800 overflow-x-auto">
          POST {webhookPath}
        </div>
      </section>

      {/* Environment Secrets Readiness & Route Variables */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        <section className="border border-slate-200 bg-white rounded-lg overflow-hidden">
          <div className="p-5 border-b border-slate-200">
            <h2 className="text-base font-semibold text-slate-900">
              Server Secret Readiness
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Secrets are read exclusively on the server via environment variables.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                  <th className="py-2.5 px-4">Variable</th>
                  <th className="py-2.5 px-4">Purpose</th>
                  <th className="py-2.5 px-4 text-right">State</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {readinessRows.map((row) => (
                  <tr key={row.name}>
                    <td className="py-3 px-4 font-mono font-medium text-slate-900 whitespace-nowrap">
                      {row.name}
                    </td>
                    <td className="py-3 px-4 text-slate-600">{row.purpose}</td>
                    <td className="py-3 px-4 text-right whitespace-nowrap font-medium">
                      <span className={row.configured ? 'text-emerald-700' : 'text-amber-700'}>
                        {row.configured ? 'Configured' : 'Unset'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="border border-slate-200 bg-white rounded-lg overflow-hidden">
          <div className="p-5 border-b border-slate-200">
            <h2 className="text-base font-semibold text-slate-900">
              Configurable Route &amp; Pipeline Variables
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Override any ProWorkflow API path or threshold in your environment file without modifying application code.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                  <th className="py-2.5 px-4">Env Variable</th>
                  <th className="py-2.5 px-4">Active Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {routeVariables.map((item) => (
                  <tr key={item.key}>
                    <td className="py-2.5 px-4 font-mono font-medium text-slate-900 whitespace-nowrap">
                      {item.key}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-600 break-all">
                      {item.value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* System Prompt Specification */}
      <section className="border border-slate-200 bg-white rounded-lg p-5 space-y-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Advisory Review System Prompt
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Applied to every PS1, PS2, and PS4 Gemini document review request.
          </p>
        </div>
        <pre className="p-4 bg-slate-50 border border-slate-200 rounded-md text-xs font-mono text-slate-800 whitespace-pre-wrap break-words max-h-96 overflow-y-auto">
          {ENGINEERING_REVIEW_SYSTEM_PROMPT}
        </pre>
      </section>
    </div>
  );
}
