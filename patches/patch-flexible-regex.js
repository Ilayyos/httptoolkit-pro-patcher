module.exports = function patchFlexibleRegex(source, context) {
  let patched = source;
  let found = false;

  try {
    // Comment out all 'debugger' and 'console.log' lines
    patched = patched.replace(/^(.*\bdebugger;.*)$/gm, '// $1');
    patched = patched.replace(/^(.*console\.log\(.*\);.*)$/gm, '// $1');
    found = /debugger;|console\.log\(/.test(source);
  } catch (err) {
    context.logger.error('Flexible regex patch failed', err);
    return source;
  }

  if (!found) context.logger.info('Flexible regex patch: No matching patterns found.');
  return patched;
}; 