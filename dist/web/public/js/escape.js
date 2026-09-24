/* ==================== SHARED HTML ESCAPING + REDACTION ==================== */
/* Loaded before other scripts. Escapes &, <, >, ", ' for safe innerHTML.
 * redact() mirrors src/security/patterns.ts REDACTION_RULES for log display. */

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function esc(s) {
  return escapeHtml(s);
}

function redact(s) {
  if (typeof s !== 'string') return s;
  var out = s;
  out = out.replace(
    /(?:api[_-]?key|apikey|token|password|secret|cookie|auth|authorization|bearer|credential|private[_-]?key|access[_-]?key)\s*[:=]\s*['"]?[\w\-\.]+/gi,
    function (m) {
      var parts = m.split(/[:=]/);
      return parts[0] + ': [REDACTED]';
    }
  );
  out = out.replace(/(?:ghp_|gho_|ghu_|ghs_|ghr_)[\w\-]+/g, '[REDACTED]');
  out = out.replace(/sk-(?:live|test)?-[\w\-]{20,}/g, '[REDACTED]');
  out = out.replace(/sk-ant-[\w\-]{20,}/g, '[REDACTED]');
  out = out.replace(/AIza[\w\-]{20,}/g, '[REDACTED]');
  out = out.replace(/AKIA[\w\-]{16}/g, '[REDACTED]');
  out = out.replace(/xox[bpsar]-[\w\-]+/g, '[REDACTED]');
  out = out.replace(/Bearer\s+[\w\-\.]+/gi, 'Bearer [REDACTED]');
  out = out.replace(/Basic\s+[\w\-\/=]+/gi, 'Basic [REDACTED]');
  out = out.replace(/[MN][\w]{23,}\.[\w\-]{6}\.[\w\-]{20,}/g, '[REDACTED]');
  out = out.replace(/(?:eyJ|eyJhbG)[\w\-]+\.([\w\-]+\.)*[\w\-]+/g, '[REDACTED]');
  return out;
}

if (typeof window !== 'undefined') {
  window.escapeHtml = escapeHtml;
  window.esc = esc;
  window.redact = redact;
}
