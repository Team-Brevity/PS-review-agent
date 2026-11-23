import test from 'node:test';
import assert from 'node:assert/strict';
import {ConcurrencyLimiter} from './concurrency';
import {executeReviewJob, type ReviewPipelineDeps} from './review.orchestrator';

function createBaseDeps(overrides?: Partial<ReviewPipelineDeps>): {
  deps: ReviewPipelineDeps;
  postedMessages: Array<{taskId: string; message: string}>;
  uploadedFileIds: string[];
  resolvedProjectLookups: string[];
} {
  const postedMessages: Array<{taskId: string; message: string}> = [];
  const uploadedFileIds: string[] = [];
  const resolvedProjectLookups: string[] = [];

  const deps: ReviewPipelineDeps = {
    reviewTag: 'review-agent',
    mentionTrigger: '@review-agent',
    deduplicateMessages: false,
    proworkflow: {
      async fetchTaskDetails(taskId) {
        return {
          id: taskId,
          title: 'Review Producer Statement',
          projectId: '9001',
          tags: ['structural', 'review-agent'],
          raw: {},
        };
      },
      async fetchLatestTaskMessage() {
        return {
          id: 'msg-500',
          body:
            '<p>@review-agent please check <a href="https://drive.google.com/file/d/1DriveFileAlpha123456/view">PS1</a> and <a href="https://drive.google.com/file/d/1DriveFileBeta789012/view">PS2</a>. cc @Alex @Priya</p>',
          createdAt: '2026-11-21T19:00:00Z',
          raw: {},
        };
      },
      async fetchProjectContext(projectId) {
        resolvedProjectLookups.push(projectId);
        return {
          projectId,
          projectNumber: '26093887',
          projectTitle: 'Design of Storage Racking for Waipapa Farm Source',
          addressLocation: '1913 State Highway 10, Waipapa, New Zealand',
          jobSpecificNotesRaw: 'Bays A-G 2400KG beam level rating',
          jobSpecificNotesList: ['Bays A-G 2400KG beam level rating'],
        };
      },
      async postTaskMessage(taskId, message) {
        postedMessages.push({taskId, message});
        return {ok: true, messageId: `posted-${postedMessages.length}`};
      },
    },
    driveUpload: {
      async uploadDriveFileToGemini(fileId) {
        uploadedFileIds.push(fileId);
        return {
          fileUri: `https://generativelanguage.googleapis.com/v1beta/files/${fileId}`,
          mimeType: 'application/pdf',
          fileName: fileId.includes('Alpha') ? 'Racking_PS1.pdf' : 'Racking_PS2.pdf',
        };
      },
    },
    geminiReview: {
      async reviewDocument(input) {
        return {
          confirmed_flags: [],
          unclear: [`Checked ${input.fileName}`],
          verified_correct: ['address/location: verified'],
        };
      },
    },
    ...overrides,
  };

  return {deps, postedMessages, uploadedFileIds, resolvedProjectLookups};
}

test('executeReviewJob exits gracefully when task tag is not review-agent', async () => {
  const {deps, postedMessages} = createBaseDeps({
    proworkflow: {
      ...createBaseDeps().deps.proworkflow,
      async fetchTaskDetails(taskId) {
        return {id: taskId, projectId: '9001', tags: ['draft'], raw: {}};
      },
    },
  });

  const result = await executeReviewJob({taskId: '101', projectId: '9001'}, deps);
  assert.equal(result.status, 'skipped_tag');
  assert.equal(postedMessages.length, 0);
});

test('executeReviewJob exits gracefully when latest message lacks @review-agent', async () => {
  const {deps, postedMessages} = createBaseDeps({
    proworkflow: {
      ...createBaseDeps().deps.proworkflow,
      async fetchLatestTaskMessage() {
        return {id: 'msg-1', body: 'Updated drawings uploaded @Alex', raw: {}};
      },
    },
  });

  const result = await executeReviewJob({taskId: '102', projectId: '9001'}, deps);
  assert.equal(result.status, 'skipped_no_mention');
  assert.equal(postedMessages.length, 0);
});

test('executeReviewJob resolves missing projectId from task and processes multiple PS keywords', async () => {
  const {deps, postedMessages, uploadedFileIds, resolvedProjectLookups} = createBaseDeps();

  const result = await executeReviewJob({taskId: '777', projectId: null}, deps);
  assert.equal(result.status, 'completed');
  assert.deepEqual(resolvedProjectLookups, ['9001']);
  assert.deepEqual(uploadedFileIds, ['1DriveFileAlpha123456', '1DriveFileBeta789012']);
  assert.equal(postedMessages.length, 2);
  assert.match(postedMessages[0].message, /^AI Review Summary\nRacking_PS1\.pdf-PS1/);
  assert.match(postedMessages[0].message, /Ready for Engineering Review: @Alex @Priya$/);
  assert.match(postedMessages[1].message, /^AI Review Summary\nRacking_PS2\.pdf-PS2/);
});

test('ConcurrencyLimiter bounds simultaneous executions', async () => {
  const limiter = new ConcurrencyLimiter(2);
  let current = 0;
  let maxSeen = 0;

  await Promise.all(
    Array.from({length: 6}, (_, idx) =>
      limiter.run(async () => {
        current += 1;
        maxSeen = Math.max(maxSeen, current);
        await new Promise((r) => setTimeout(r, 15));
        current -= 1;
        return idx;
      })
    )
  );

  assert.equal(maxSeen, 2);
  assert.equal(limiter.getActiveCount(), 0);
});
