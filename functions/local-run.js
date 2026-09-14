'use strict';

const { scheduledCanary } = require('./index');

async function main() {
  if (scheduledCanary && typeof scheduledCanary.run === 'function') {
    await scheduledCanary.run({});
    return;
  }

  if (typeof scheduledCanary === 'function') {
    await scheduledCanary({});
    return;
  }

  throw new Error('Could not invoke scheduledCanary locally.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
