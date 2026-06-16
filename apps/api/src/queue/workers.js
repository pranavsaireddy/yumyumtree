'use strict';

const boss = require('./boss');
const logger = require('../lib/logger');

const pushKot = require('./jobs/pushKot');
const dispatchDelivery = require('./jobs/dispatchDelivery');
const sendNotification = require('./jobs/sendNotification');
const awardLoyalty = require('./jobs/awardLoyalty');

// pg-boss v12 notes (the §9 example predates v12; same intent, current API):
//   1. Retry policy (retryLimit/retryBackoff) is a QUEUE-level option set via createQueue —
//      it is NOT a boss.work() option in v12. Jobs inherit it from the queue.
//   2. Queues must be created explicitly before work()/send(). createQueue is idempotent.
//   3. A work handler receives a BATCH (array) of jobs; default batchSize is 1.
const QUEUES = [
  { name: 'pos.pushKot', options: { retryLimit: 5, retryBackoff: true }, handler: pushKot },
  { name: 'delivery.dispatch', options: { retryLimit: 3, retryBackoff: true }, handler: dispatchDelivery },
  { name: 'notify.statusChanged', options: { retryLimit: 3 }, handler: sendNotification },
  { name: 'loyalty.award', options: { retryLimit: 3 }, handler: awardLoyalty },
];

let started = false;

async function startWorkers() {
  await boss.start();

  for (const queue of QUEUES) {
    await boss.createQueue(queue.name, queue.options);
    await boss.work(queue.name, async (jobs) => {
      for (const job of jobs) {
        await queue.handler(job.data);
      }
    });
  }

  started = true;
  logger.info('pg-boss workers started');
}

// Readiness signal for /readyz. Read via the module object (workers.isBossStarted()) so the
// boolean reflects the current value, not a captured reference.
function isBossStarted() {
  return started;
}

module.exports = { startWorkers, isBossStarted };
