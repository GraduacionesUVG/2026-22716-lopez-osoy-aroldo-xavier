'use strict';

const ALLOWED_TAGS = new Set(['p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'code']);
const DROP_WITH_CONTENT = /<(script|style|iframe|object|embed|svg|math)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const HTML_COMMENT = /<!--[\s\S]*?(?:-->|$)/g;
const HTML_TAG = /<(\/?)\s*([a-z][a-z0-9-]*)([^>]*)>/gi;

function sanitizeAgentAnswer(value, maxLength = 1200) {
  const raw = String(value ?? '').slice(0, maxLength);
  const openTags = [];
  return raw
    .replace(HTML_COMMENT, '')
    .replace(DROP_WITH_CONTENT, '')
    .replace(HTML_TAG, (_tag, closing, rawName, remainder) => {
      const name = rawName.toLowerCase();
      if (!ALLOWED_TAGS.has(name)) return '';
      if (name === 'br') {
        const hasAttributes = String(remainder).replace(/\/$/, '').trim();
        return closing || hasAttributes ? '' : '<br>';
      }
      if (closing) {
        const index = openTags.findLastIndex((entry) => entry.name === name);
        if (index < 0) return '';
        const [{ emitted }] = openTags.splice(index, 1);
        return emitted ? `</${name}>` : '';
      }
      const emitted = !String(remainder).replace(/\/$/, '').trim();
      openTags.push({ name, emitted });
      return emitted ? `<${name}>` : '';
    })
    .trim();
}

module.exports = { ALLOWED_TAGS, sanitizeAgentAnswer };
