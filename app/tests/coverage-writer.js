import { Meteor } from 'meteor/meteor';
import fs from 'fs';
import path from 'path';

if (Meteor.isServer) {
  after(function () {
    const coverage = global.__coverage__;
    if (!coverage) return;
    const dir = process.env.COVERAGE_DIR || path.resolve('.nyc_output');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'coverage.json'), JSON.stringify(coverage));
  });
}
