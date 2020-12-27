# Change Log

All notable changes to the "queryselector-completion" extension will be documented in this file.

## [1.0.0] - 2020-12-27
### ADDED
- completions for `.querySelector` in typescript and javascript, a HTML file is imported using an ES6 import like `import * as html from "./template.html"`.
- code action for not defined class properties to define a private property and inferring the correct type by using the querySelector and the html file imported (eg. generate a `HTMLInputElement` property)

## [1.1.0 - Unreleased]
### ADDED
- provide code fix also on 2551 ts error (did you mean...?)

### CHANGED
- fixes typos in README.md and package description
