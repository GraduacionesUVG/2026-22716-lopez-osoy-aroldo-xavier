'use strict';

const { connectRedis } = require('../config/redis');

const SESSION_PREFIX = 'patient:session:';

function appError(status, code, message) {
  const err = new Error(message ?? code);
  err.status = status;
  err.code = code;
  return err;
}

function parseResult(result) {
  const [status, rawPayload] = result;
  return {
    status,
    payload: rawPayload ? JSON.parse(rawPayload) : null,
  };
}

async function evalSession(redisKey, script, args = []) {
  const redis = await connectRedis();
  const result = await redis.eval(script, {
    keys: [redisKey],
    arguments: args,
  });
  return parseResult(result);
}

const ACTIVATE_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return {'NOT_FOUND', ''} end
local session = cjson.decode(raw)
if session.state == 'PENDING' then
  session.state = 'ACTIVE'
  session.activatedAt = ARGV[1]
  redis.call('SET', KEYS[1], cjson.encode(session), 'KEEPTTL')
  return {'ACTIVATED', cjson.encode(session)}
end
if session.state == 'ACTIVE' then return {'ACTIVE', raw} end
if session.state == 'PROCESSING' then return {'PROCESSING', raw} end
if session.state == 'CONSUMED' then return {'CONSUMED', raw} end
return {'INVALID_STATE', raw}
`;

async function activateSession(redisKey) {
  const result = await evalSession(redisKey, ACTIVATE_SCRIPT, [new Date().toISOString()]);

  if (result.status === 'NOT_FOUND') {
    throw appError(404, 'SESSION_NOT_FOUND', 'The session does not exist or has expired');
  }
  if (result.status === 'PROCESSING') {
    throw appError(409, 'SESSION_PROCESSING', 'The form submission is currently being processed');
  }
  if (result.status === 'CONSUMED') {
    throw appError(409, 'SESSION_CONSUMED', 'The form was already submitted');
  }
  if (!['ACTIVATED', 'ACTIVE'].includes(result.status)) {
    throw appError(409, 'SESSION_INVALID_STATE', 'The session is in an invalid state');
  }

  return {
    payload: result.payload,
    alreadyActive: result.status === 'ACTIVE',
  };
}

const GET_ACTIVE_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return {'NOT_FOUND', ''} end
local session = cjson.decode(raw)
return {session.state or 'INVALID_STATE', raw}
`;

async function getActiveSession(redisKey) {
  const result = await evalSession(redisKey, GET_ACTIVE_SCRIPT);
  if (result.status === 'NOT_FOUND') {
    throw appError(404, 'SESSION_NOT_FOUND', 'The session does not exist or has expired');
  }
  if (result.status !== 'ACTIVE') {
    const status = result.status === 'CONSUMED' || result.status === 'PROCESSING' ? 409 : 401;
    throw appError(status, `SESSION_${result.status}`, 'The session is not active');
  }
  return result.payload;
}

const REGISTER_UPLOAD_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return {'NOT_FOUND', ''} end
local session = cjson.decode(raw)
if session.state ~= 'ACTIVE' then return {session.state or 'INVALID_STATE', raw} end
if not session.uploads then session.uploads = {} end
table.insert(session.uploads, {
  objectKey = ARGV[1],
  category = ARGV[2],
  contentType = ARGV[3],
  sizeBytes = tonumber(ARGV[4]),
  createdAt = ARGV[5]
})
redis.call('SET', KEYS[1], cjson.encode(session), 'KEEPTTL')
return {'REGISTERED', cjson.encode(session)}
`;

async function registerUpload(redisKey, objectKey, category, contentType, sizeBytes) {
  const result = await evalSession(redisKey, REGISTER_UPLOAD_SCRIPT, [
    objectKey,
    category,
    contentType,
    String(sizeBytes),
    new Date().toISOString(),
  ]);
  if (result.status === 'NOT_FOUND') {
    throw appError(404, 'SESSION_NOT_FOUND', 'The session does not exist or has expired');
  }
  if (result.status !== 'REGISTERED') {
    throw appError(409, `SESSION_${result.status}`, 'The session is not active');
  }
}

const ACQUIRE_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return {'NOT_FOUND', ''} end
local session = cjson.decode(raw)
if session.state == 'CONSUMED' then return {'CONSUMED', raw} end
if session.state ~= 'ACTIVE' then return {session.state or 'INVALID_STATE', raw} end
session.state = 'PROCESSING'
session.processingAt = ARGV[1]
redis.call('SET', KEYS[1], cjson.encode(session), 'KEEPTTL')
return {'ACQUIRED', cjson.encode(session)}
`;

async function acquireSubmission(redisKey) {
  const result = await evalSession(redisKey, ACQUIRE_SCRIPT, [new Date().toISOString()]);
  if (result.status === 'NOT_FOUND') {
    throw appError(404, 'SESSION_NOT_FOUND', 'The session does not exist or has expired');
  }
  if (result.status === 'CONSUMED') {
    return { alreadySubmitted: true, payload: result.payload };
  }
  if (result.status === 'PROCESSING') {
    return { alreadySubmitted: false, inProgress: true, payload: result.payload };
  }
  if (result.status !== 'ACQUIRED') {
    throw appError(401, `SESSION_${result.status}`, 'The session must be activated before submitting');
  }
  return { alreadySubmitted: false, inProgress: false, payload: result.payload };
}

const COMPLETE_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return {'NOT_FOUND', ''} end
local session = cjson.decode(raw)
if session.state == 'CONSUMED' then return {'CONSUMED', raw} end
if session.state ~= 'PROCESSING' then return {session.state or 'INVALID_STATE', raw} end
session.state = 'CONSUMED'
session.consumedAt = ARGV[1]
session.result = cjson.decode(ARGV[2])
redis.call('SET', KEYS[1], cjson.encode(session), 'KEEPTTL')
return {'COMPLETED', cjson.encode(session)}
`;

async function completeSubmission(redisKey, result) {
  const completed = await evalSession(redisKey, COMPLETE_SCRIPT, [
    new Date().toISOString(),
    JSON.stringify(result),
  ]);
  if (!['COMPLETED', 'CONSUMED'].includes(completed.status)) {
    throw appError(409, `SESSION_${completed.status}`, 'Could not mark the session as consumed');
  }
}

const ROLLBACK_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return {'NOT_FOUND', ''} end
local session = cjson.decode(raw)
if session.state == 'PROCESSING' then
  session.state = 'ACTIVE'
  session.processingAt = nil
  redis.call('SET', KEYS[1], cjson.encode(session), 'KEEPTTL')
  return {'ROLLED_BACK', cjson.encode(session)}
end
return {session.state or 'INVALID_STATE', raw}
`;

async function rollbackSubmission(redisKey) {
  return evalSession(redisKey, ROLLBACK_SCRIPT);
}

module.exports = {
  SESSION_PREFIX,
  activateSession,
  getActiveSession,
  registerUpload,
  acquireSubmission,
  completeSubmission,
  rollbackSubmission,
};
