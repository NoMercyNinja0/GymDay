// shape.js: run from android/app/src/main/assets/www (npm install acorn first) (node ../../../../../tools/shape.js). Joining the scripts into one file (tools/bundle.py)
// is only safe while every script is a self-running function or plain window.X = … lines. This says if one is not.
// What each script of the page is made of at its top level: one self-running function, plain assignments, or declarations
const acorn = require('acorn'), fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const files = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
let odd = 0;
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8'); let ast;
  try { ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script' }); } catch (e) { console.log(f, 'PARSE ERROR', e.message); odd++; continue; }
  const kinds = ast.body.map(n => {
    if (n.type === 'ExpressionStatement') {
      if (n.directive) return 'directive:' + n.directive;
      const e = n.expression;
      if (e.type === 'CallExpression' && (e.callee.type === 'FunctionExpression' || e.callee.type === 'ArrowFunctionExpression')) return 'iife';
      if (e.type === 'AssignmentExpression' && e.left.type === 'MemberExpression' && e.left.object.name === 'window') return 'window.' + (e.left.property.name || '?') + ' =';
      return 'expr:' + e.type;
    }
    return n.type + (n.declarations ? ':' + n.kind + ' ' + n.declarations.map(d => d.id.name).join(',') : n.id ? ':' + n.id.name : '');
  });
  const plain = kinds.every(k => k === 'iife' || k.startsWith('window.'));
  if (!plain) { odd++; console.log(f.padEnd(14), kinds.join(' | ').slice(0, 300)); }
  if (/document\.currentScript/.test(src)) console.log(f, 'uses document.currentScript');
}
console.log(files.length, 'scripts;', odd, 'with something other than a self-running function or window.X = …');
