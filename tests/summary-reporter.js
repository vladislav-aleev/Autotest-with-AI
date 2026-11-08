import fs from 'node:fs';

export default class SummaryReporter {
  onBegin(config, suite) { this.suite = suite; }
  onEnd() {
    const counts = { passed: 0, failed: 0, skipped: 0, xfail: 0 };
    const details = this.suite.allTests().map(test => {
      const result = test.results.at(-1);
      const status = result?.status === 'skipped' ? 'skipped'
        : test.outcome() === 'unexpected' ? 'failed'
          : test.expectedStatus === 'failed' ? 'xfail' : 'passed';
      counts[status]++;
      const observations = (result?.attachments ?? []).filter(a => a.contentType === 'application/json' && a.body)
        .map(a => ({ name: a.name, data: JSON.parse(a.body.toString()) }));
      return { test: test.title, status, annotations: test.annotations, observations };
    });
    const summary = { counts, details };
    fs.mkdirSync('reports', { recursive: true });
    fs.writeFileSync('reports/summary.json', JSON.stringify(summary, null, 2));
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      '### Actual test outcomes\n\n```json\n' + JSON.stringify(summary, null, 2) + '\n```\n');
    if (process.env.GITHUB_ACTIONS) {
      // Public check annotations expose counts even when artifact downloads require authentication.
      console.log('::notice title=E2E results::' + JSON.stringify(summary).replaceAll('%','%25').replaceAll('\n','%0A').replaceAll('\r','%0D'));
    }
  }
}
