const recast = require('recast');
const parser = require('@babel/parser');

module.exports = function patchProPlan(source, context) {
  let ast;
  try {
    ast = recast.parse(source, {
      parser: {
        parse: code => parser.parse(code, { sourceType: 'module', plugins: ['classProperties', 'objectRestSpread'] })
      }
    });
  } catch (err) {
    context.logger.error('Failed to parse source for pro plan patch', err);
    return source; // Fallback: return original
  }

  let patched = false;

  recast.types.visit(ast, {
    visitClassDeclaration(path) {
      if (path.node.id && /Account|User|Subscription/i.test(path.node.id.name)) {
        // Add or replace a static property for pro plan
        const staticProp = recast.parse('static isPro = true;').program.body[0];
        // Remove any existing isPro static property
        path.node.body.body = path.node.body.body.filter(
          n => !(n.static && n.key && n.key.name === 'isPro')
        );
        path.node.body.body.push(staticProp);
        patched = true;
      }
      this.traverse(path);
    }
  });

  if (!patched) {
    context.logger.warn('Pro plan patch: No matching class found, skipping.');
    return source;
  }

  return recast.print(ast).code;
}; 