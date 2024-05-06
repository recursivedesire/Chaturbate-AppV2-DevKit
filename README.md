# Chaturbate-AppV2-DevKit
Develop, test, and compile apps for the Chaturbate App v2 platform, all locally.

## Table of Contents
- [Introduction](#introduction)
- [Features](#features)
- [REPL](#repl)
- [Contribution](#contribution)
- [License](#license)

## Introduction
Chaturbate-AppV2-DevKit provides a streamlined solution for developing apps for the Chaturbate App v2 platform using the v0.52.0 API. Write and test with TypeScript, then compile to JavaScript for deployment.

For comprehensive documentation, including setup, API details, and testing instructions, please visit the [DevKit Wiki](https://github.com/recursivedesire/Chaturbate-AppV2-DevKit/wiki).

## Features
### Core Features
- **TypeScript Integration**: Utilize TypeScript with custom Babel plugins tailored for the Chaturbate App v2 platform:
  - **devportal-compat-plugin**: Ensures all necessary code is available in a single bundled file by stripping unnecessary imports and inlining modules. [Learn more](https://github.com/recursivedesire/Chaturbate-AppV2-DevKit/wiki/DevPortal-Compat).
  - **macro-plugin**: Introduces compile-time TypeScript macro execution, allowing developers to execute code during the build process and directly replace function calls with their results. [Learn more](https://github.com/recursivedesire/Chaturbate-AppV2-DevKit/wiki/Macros).
- **Local API Definitions**: Local TypeScript definitions of the Chaturbate App v2 API, primed for development and testing.
- **AVA-powered Unit Testing**: Robust testing framework integration using AVA and TSC, allowing for effective unit tests. [Learn more](https://github.com/recursivedesire/Chaturbate-AppV2-DevKit/wiki/Testing).
- **Seamless TypeScript-to-JavaScript Compilation**: Easy compilation process facilitated by Babel, readying your code for deployment.

### Helper Libraries
- **Command System**: Modular command management with dynamic registration, permission checks, and argument parsing. [Learn more](https://github.com/recursivedesire/Chaturbate-AppV2-DevKit/wiki/Command-System).
- **Data Processing**: Tools for data encoding, decoding, and hashing, optimized for performance and security. [Learn more](https://github.com/recursivedesire/Chaturbate-AppV2-DevKit/wiki/Data-Processing).
- **StorageKV**: Advanced key-value storage with features like namespaces and skip lists for efficient data management. [Learn more](https://github.com/recursivedesire/Chaturbate-AppV2-DevKit/wiki/StorageKV).
- **Template Engine**: Dynamic string rendering with support for placeholders, conditional logic, and recursive templates. [Learn more](https://github.com/recursivedesire/Chaturbate-AppV2-DevKit/wiki/Template-Engine).

## REPL
Upcoming REPL console for local app testing will simulate the Chaturbate App v2 platform's experience using the v0.52.0 API, providing a robust testing environment without deploying your apps.

## Contribution
All forms of contributions are welcome! If you have ideas for improvements or want to collaborate, please open an issue or submit a pull request.

## License
This project is licensed under the MIT License. For more details, see the LICENSE file in our repository.

