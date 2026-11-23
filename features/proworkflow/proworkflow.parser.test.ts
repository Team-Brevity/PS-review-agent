import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractGoogleDriveFileId,
  extractProjectContext,
  extractWebhookIds,
  hasRequiredTag,
  parseMessageDirectives,
  selectLatestMessage,
} from './proworkflow.parser';

test('extractWebhookIds handles multiple ProWorkflow edittask payload shapes', () => {
  assert.deepEqual(
    extractWebhookIds({event: 'edittask', taskid: 98421, projectid: 55102}),
    {event: 'edittask', taskId: '98421', projectId: '55102'}
  );

  assert.deepEqual(
    extractWebhookIds({trigger: 'EditTask', data: {id: '112233'}}),
    {event: 'edittask', taskId: '112233', projectId: null}
  );

  assert.equal(extractWebhookIds({event: 'edittask'}), null);
});

test('hasRequiredTag checks review-agent case-insensitively across tag formats', () => {
  assert.equal(hasRequiredTag({tags: ['Structural', 'Review-Agent']}, 'review-agent'), true);
  assert.equal(hasRequiredTag({tags: ['structural']}, 'review-agent'), false);
});

test('selectLatestMessage picks the newest message by timestamp or id', () => {
  const latest = selectLatestMessage({
    messages: [
      {id: '101', content: 'Old message', createdat: '2026-11-20T10:00:00Z'},
      {
        id: '102',
        content: 'Please @review-agent check <a href="https://drive.google.com/file/d/1AbCDefGhIjKlMnOpQrStUvWxYz123/view">PS1</a> @John',
        createdat: '2026-11-21T12:00:00Z',
      },
    ],
  });
  assert.equal(latest?.id, '102');
});

test('extractGoogleDriveFileId parses Drive and Docs URLs', () => {
  assert.equal(
    extractGoogleDriveFileId('https://drive.google.com/file/d/1Pk2fCKIm00QZCrTbU2OLCtqdZzmFqsNG7/view?usp=sharing'),
    '1Pk2fCKIm00QZCrTbU2OLCtqdZzmFqsNG7'
  );
  assert.equal(
    extractGoogleDriveFileId('https://drive.google.com/open?id=1AbCDefGhIjKlMnOpQrStUvWxYz999'),
    '1AbCDefGhIjKlMnOpQrStUvWxYz999'
  );
  assert.equal(extractGoogleDriveFileId('https://example.com/file/d/notgoogle12345'), null);
});

test('parseMessageDirectives extracts @review-agent trigger, engineer mentions, and multiple PS links', () => {
  const html = `
    <p>Hi @review-agent, please review the attached
      <a href="https://drive.google.com/file/d/1FileIdForPs1Example123456/view">PS1</a>
      and
      <a href="https://drive.google.com/open?id=1FileIdForPs4Example789012">ps4</a>
      documents for Waipapa Farm Source.
    </p>
    <p>Looping in @Niko.Peiris, @GeorgiaP and @niko.peiris for sign-off.</p>
  `;

  const parsed = parseMessageDirectives(html, '@review-agent');
  assert.equal(parsed.hasReviewTrigger, true);
  assert.deepEqual(parsed.taggedEngineers, ['@Niko.Peiris', '@GeorgiaP']);
  assert.equal(parsed.driveDocuments.length, 2);
  assert.deepEqual(
    parsed.driveDocuments.map((d) => ({keywordType: d.keywordType, fileId: d.fileId})),
    [
      {keywordType: 'PS1', fileId: '1FileIdForPs1Example123456'},
      {keywordType: 'PS4', fileId: '1FileIdForPs4Example789012'},
    ]
  );
});

test('extractProjectContext parses Waipapa Farm Source ProWorkflow Private Notes structure', () => {
  const project = {
    id: '26093887',
    title: '26093887 - Design of Storage Racking for Waipapa Farm Source',
    privatenotes: `
      Notes for Delivery:
      - Project Won: November 16 2026 15:41:13
      - Service Level: Best Value
      - Client Status: Existing Client
      - Project address: 1913 State Highway 10, Waipapa, New Zealand
      - Importance Level:
      - BCN:
      - Job Specific Notes: PS1 on the below bays in red? Bays A-G All x7 Bays will be 3500H x 2700L x 900Dmm using 120mm beams – looking for a 2400KG beam level rating Address: 1913 State Highway 10, Waipapa 0230
      - Client Specific Notes: Anchor preference: Rawlplug screw, then Hilti HUS4, then Rawlplug expansion
    `,
  };

  const context = extractProjectContext(project, '26093887');
  assert.equal(context.projectNumber, '26093887');
  assert.equal(context.projectTitle, 'Design of Storage Racking for Waipapa Farm Source');
  assert.equal(context.addressLocation, '1913 State Highway 10, Waipapa, New Zealand');
  assert.match(context.jobSpecificNotesRaw, /Bays A-G All x7 Bays will be 3500H x 2700L x 900Dmm/);
});
