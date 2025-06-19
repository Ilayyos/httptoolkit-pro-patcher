const recast = require('recast');
const parser = require('@babel/parser');

module.exports = function patchBypassTelemetry(source, context) {
  let ast;
  try {
    ast = recast.parse(source, {
      parser: {
        parse: code => parser.parse(code, { sourceType: 'module', plugins: ['classProperties', 'objectRestSpread'] })
      }
    });
  } catch (err) {
    context.logger.error('Failed to parse source for telemetry patch', err);
    return source;
  }

  let patched = false;

  recast.types.visit(ast, {
    visitCallExpression(path) {
      // Look for telemetry/event tracking calls
      const callee = path.node.callee;
      if (
        (callee.type === 'Identifier' && /trackEvent|sendTelemetry/i.test(callee.name)) ||
        (callee.type === 'MemberExpression' && callee.object && callee.property &&
          (/Sentry|telemetry|event/i.test(callee.object.name || '') || /capture|track|send/i.test(callee.property.name || '')))
      ) {
        // Replace with a harmless literal (void 0)
        path.replace(recast.parse('void 0').program.body[0].expression);
        patched = true;
      }
      this.traverse(path);
    }
  });

  if (!patched) {
    context.logger.info('Telemetry patch: No telemetry/event calls found.');
    return source;
  }

  return recast.print(ast).code;
}; 