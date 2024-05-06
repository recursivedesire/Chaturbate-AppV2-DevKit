const fs = require('fs');
const nodePath = require('path');
const babelParser = require('@babel/parser');
const babelTransform = require("@babel/core").transform;

module.exports = function (babel) {
    const {types: t} = babel;

    function inlineFileContent(filePath, relativeTo) {
        const currentFileExtension = nodePath.extname(relativeTo);
        let absolutePath = nodePath.resolve(nodePath.dirname(relativeTo), filePath);

        // Try with the inferred extension if the file doesn't exist initially
        if (!fs.existsSync(absolutePath)) {
            if (fs.existsSync(`${absolutePath}${currentFileExtension}`)) {
                absolutePath = `${absolutePath}${currentFileExtension}`;
            } else if (fs.existsSync(`${absolutePath}.ts`)) {
                absolutePath = `${absolutePath}.ts`;
            } else if (fs.existsSync(`${absolutePath}.js`)) {
                absolutePath = `${absolutePath}.js`;
            }
        }

        try {
            const fileContent = fs.readFileSync(absolutePath, 'utf8');
            const transformed = babelTransform(fileContent, {
                sourceType: "module",
                plugins: [["@babel/plugin-syntax-typescript", {isTSX: false}], "./macro-plugin", "./devportal-compat-plugin"]
            });

            if (transformed && transformed.code) {
                return babelParser.parse(transformed.code, {
                    sourceType: "module",
                    plugins: ["typescript"]
                }).program.body;
            } else {
                console.error(`Error transforming inlined file content for path ${absolutePath}`);
                return [];
            }
        } catch (error) {
            console.error(`Error inlining file content for path ${absolutePath}`, error);
            return [];
        }
    }

    return {
        name: "devportal-compat-plugin",
        visitor: {
            Program: {
                enter(path, state) {
                    state.inlineImports = [];
                    state.fullInlines = [];  // New state to hold the full inlines
                    state.nodesToBeRemoved = [];

                    path.traverse({
                        ImportDeclaration(innerPath) {
                            const importPath = innerPath.node.source.value;

                            // Check if import has ./api/ in its path or is named SharedCode[.js|.ts]
                            if (importPath.includes('./api/') || /sharedCode(\.js|\.ts)?$/.test(importPath)) {
                                state.nodesToBeRemoved.push(innerPath);  // Add to removal list
                                return; // Skip the rest of the code for this import
                            }

                            // Check if the import has no specifiers and save for later
                            if (innerPath.node.specifiers.length === 0) {
                                state.fullInlines.push({path: importPath, nodePath: innerPath});
                                return; // Skip the rest of the code for this import
                            }

                            // Treat every import from the 'src' folder in a generalized manner
                            if (importPath.startsWith('./')) {
                                const localName = innerPath.node.specifiers[0].local.name;

                                state.inlineImports.push({
                                    localName: localName,
                                    path: innerPath
                                });
                            }
                        },
                        // Add handlers for export statements
                        ExportNamedDeclaration(innerPath) {
                            state.nodesToBeRemoved.push(innerPath);
                        },
                        ExportDefaultDeclaration(innerPath) {
                            state.nodesToBeRemoved.push(innerPath);
                        }
                    });
                },
                exit(path, state) {
                    let inlinedPartsFromModules = new Map();

                    // Make replacements
                    state.inlineImports.forEach(inlineImport => {
                        if (!inlineImport.path.node) return;
                        if (!state.file.opts.filename) return;

                        // Get the path of the imported file
                        const importPath = inlineImport.path.node.source.value;
                        const fullInlinedContent = inlineFileContent(importPath, state.file.opts.filename);

                        if (fullInlinedContent && fullInlinedContent.length > 0) {
                            const importedNames = inlineImport.path.node.specifiers.map(specifier => specifier.imported.name);

                            if (!inlinedPartsFromModules.has(importPath)) {
                                inlinedPartsFromModules.set(importPath, new Set());
                            }

                            const alreadyInlinedParts = inlinedPartsFromModules.get(importPath);
                            const partsToInline = importedNames.filter(name => !alreadyInlinedParts.has(name));

                            if (partsToInline.length > 0) {
                                const relevantInlinedContent = fullInlinedContent.filter(node => {
                                    if (t.isVariableDeclaration(node)) {
                                        return node.declarations.some(declaration => partsToInline.includes(declaration.id.name));
                                    } else if (t.isFunctionDeclaration(node) || t.isClassDeclaration(node)) {
                                        return partsToInline.includes(node.id.name);
                                    }
                                    return false;
                                });

                                const filename = nodePath.basename(importPath).replace(/\./g, "_");

                                const nameMapping = {};
                                relevantInlinedContent.forEach(node => {
                                    if (node.id && typeof node.id.name === 'string') {
                                        const oldName = node.id.name;
                                        const newName = `${filename}_${oldName}`;
                                        node.id.name = newName;
                                        nameMapping[oldName] = newName;
                                    }
                                });

                                path.traverse({
                                    Identifier(identifierPath) {
                                        if (nameMapping[identifierPath.node.name]) {
                                            identifierPath.node.name = nameMapping[identifierPath.node.name];
                                        }
                                    }
                                });

                                inlineImport.path.replaceWithMultiple(relevantInlinedContent);
                                partsToInline.forEach(part => alreadyInlinedParts.add(part));
                            } else {
                                state.nodesToBeRemoved.push(inlineImport.path);
                            }
                        }
                    });

                    // Process full inlines
                    state.fullInlines.forEach(inline => {
                        const inlinedContent = inlineFileContent(inline.path, state.file.opts.filename);
                        if (inlinedContent && inlinedContent.length > 0) {
                            inline.nodePath.replaceWithMultiple(inlinedContent);
                        } else {
                            state.nodesToBeRemoved.push(inline.nodePath);
                        }
                    });

                    // Determine if there are any export declarations left
                    const hasExports = path.node.body.some(node =>
                        t.isExportDeclaration(node)
                    );

                    // If no export declarations, change source type to 'script'
                    if (!hasExports) {
                        path.node.sourceType = "script";
                        path.node.body = path.node.body.filter(node =>
                            !t.isExportDeclaration(node)
                        );
                    }

                    // Remove nodes in the removal list
                    state.nodesToBeRemoved.forEach(nodePath => {
                        if (nodePath && !nodePath.removed) {
                            nodePath.remove();
                        }
                    });
                }
            }
        }
    };
};

