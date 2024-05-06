module.exports = function ({ types: t }) {
  // Storage for compile-time function bodies
  const compileTimeFunctions = {};

  return {
    visitor: {
      FunctionDeclaration(path) {
        const functionName = path.node.id.name;
        if (functionName.startsWith('MACRO_')) {
          compileTimeFunctions[functionName] = path.toString();
          path.skip();
        }
      },
      CallExpression(path) {
        const callee = path.node.callee;
        if (t.isIdentifier(callee) && callee.name.startsWith('MACRO_')) {
          const functionName = callee.name;
          if (compileTimeFunctions[functionName]) {
            try {
              const functionBody = compileTimeFunctions[functionName];
              const args = path.node.arguments.map(arg => {
                if (t.isStringLiteral(arg)) {
                  return `"${arg.value.replace(/"/g, '\\"')}"`;
                } else if (t.isNumericLiteral(arg) || t.isBooleanLiteral(arg)) {
                  return arg.value;
                } else {
                  throw new Error("Unsupported argument type in compile-time function.");
                }
              });
              // Construct and evaluate the function call
              const functionCall = `(${functionBody})(${args.join(', ')})`;
              const result = eval(functionCall);
              path.replaceWith(t.valueToNode(result));
            } catch (error) {
              throw path.buildCodeFrameError("Error executing compile-time function: " + error.message);
            }
          }
        }
      },
      Program: {
        exit(path) {
          path.traverse({
            FunctionDeclaration(path) {
              if (path.node.id.name.startsWith('MACRO_')) {
                path.remove();
              }
            }
          });
        }
      }
    }
  };
};
