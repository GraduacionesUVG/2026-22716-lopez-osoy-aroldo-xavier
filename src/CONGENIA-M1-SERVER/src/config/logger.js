'use strict';

const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(process.cwd(), 'logs');
const EVENT_LOG = path.join(LOG_DIR, 'event', `${today()}.log`);
const ERR_LOG = path.join(LOG_DIR, 'err', `${today()}.log`);

function today() {
  return new Date().toISOString().slice(0, 10);
}

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function write(filePath, level, event, data) {
  const line = JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...data });

  // The ECS `awslogs` driver only collects stdout and stderr. A log written to
  // disk never reaches CloudWatch and dies with the task, which is ephemeral
  // and has no volume: standard output is the primary sink and the file is
  // kept as a convenience for the local workflow.
  if (level === 'ERROR') {
    console.error(line);
  } else {
    console.log(line);
  }

  try {
    ensureDir(filePath);
    fs.appendFileSync(filePath, line + '\n');
  } catch {
    // Never let logging crash the request
  }
}

function logEvent(event, data = {}) {
  write(EVENT_LOG, 'INFO', event, data);
}

function logError(event, data = {}) {
  write(ERR_LOG, 'ERROR', event, data);
}

module.exports = { logEvent, logError };
