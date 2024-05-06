# Chaturbate-AppV2-DevKit
Develop, test, and compile apps for the Chaturbate App v2 platform, all locally.

## Table of Contents
- [Introduction](#introduction)
- [Features](#features)
- [Getting Started](#getting-started)
- [API](#api)
- [Testing](#testing)
- [Compiling](#compiling)
- [REPL](#repl)
- [Contribution](#contribution)

## Introduction
Chaturbate-AppV2-DevKit provides a streamlined solution to develop apps for the Chaturbate App v2 platform using the v0.52.0 API. Write and test with TypeScript, then compile to JavaScript for deployment.

## Features
- ✅ TypeScript integration with Babel. Enhanced with custom Babel plugins for optimized bundling, tailored for the Chaturbate App v2 platform. This includes:
    - **devportal-compat-plugin**: Ensures all necessary code is available in a single bundled file by stripping unnecessary imports and inlining modules. [See detailed mechanics](./PLUGIN-DOCS.md#custom-babel-inline-plugin-detailed-mechanics).
    - **macro-plugin**: Introduces compile-time TypeScript macro execution, allowing developers to execute code during the build process and directly replace function calls with their results. This feature facilitates performant and configuration-specific code adjustments without runtime overhead. [Learn more about macros](./PLUGIN-DOCS.md#typescript-macros-plugin-preprocessor-functionality).
- ✅ Seamless TypeScript-to-JavaScript compilation, Chaturbate-ready.
- ✅ Local API definitions and docs for Chaturbate App v2.
- ✅ AVA-powered unit testing with TSC and proxyquire.
- 🔄 Coming Soon: REPL console for hassle-free app testing.

## Getting Started
1. Clone this repository: `git clone <repo-url>`.
2. Install dependencies: `npm install`.
3. Begin development in the `src` directory.
4. Run tests: `npm test`.
5. Compile: `npm run build`.
6. Deploy: Copy the output from `dist` to the Chaturbate App v2 IDE.

## API
Discover the Chaturbate App v2 API (v0.52.0) in the `src/api` folder. It’s documented with JSDoc and structured with TypeScript interfaces. While it isn’t implemented, it's primed for testing with proxyquire mock objects.

## Testing
For now, TypeScript tests should be placed in the `src` directory. Flexible variable exports per event handler enable adaptive testing. Tests are executed using AVA and TSC. Start with `npm test`.

```typescript
import test from 'ava';
import proxyquire from "proxyquire";
import {Message} from "./api/$message";

const mockMessage: Message = {
    body: "Hello, world!",
    // ...
};

test('sample test', t => {
    const chatMessage = proxyquire('./chatMessage', {
        './api/$message': mockMessage,
    });
    t.is(chatMessage.$message.body, mockMessage.body);
});
```

## Compiling
Babel facilitates the TypeScript-to-JavaScript compilation. Once compiled, retrieve the JavaScript from the `dist` directory, ready for the Chaturbate App v2 IDE.

For a deeper understanding of the custom Babel plugin used in this development kit, please refer to the [detailed plugin documentation](./PLUGIN-DOCS.md).

## REPL
Plans are underway to introduce a REPL console for local app testing, with a simulation of the Chaturbate App v2 platform's experience using the v0.52.0 API.

## Contribution
All forms of contributions are welcome! If you have improvements, ideas, or would like to collaborate, please open an issue or submit a pull request. Any feedback or assistance is highly valued.
