# queryselector completion vscode extension

When developing web applications with vanilla js and web components, it is often required to select elements from a imported template with `querySelector`.
This extension provides autocompletion for selectors and a code action to define corresponding class properties.

## Features

### `querySelector` completions in javascript/typescript

If a html document is imported via ES6 imports, typing `querySelector` in js/ts documents triggers autocompletion of possible css selectors.

![querySelector completion items](https://raw.githubusercontent.com/tuwrraphael/queryselector-completion/main/images/completion.gif)

Import the document for example as:
~~~js
import * as template from "./template.html";
~~~

Currently supported completion suggestions:
* id attributes
* data-* attributes

### Infer type from html when generating class properties for html elements (typescript)

When generating a missing class property, for a querySelector, the type of the property is generated as `any`. This extension infers the type correctly using the css selector and the imported html template.

![class property type inference](https://raw.githubusercontent.com/tuwrraphael/queryselector-completion/main/images/generateprop.gif)

As above the document needs to be imported:
~~~js
import template from "./template.html";
~~~

<!-- ## Requirements

If you have any requirements or dependencies, add a section describing those and how to install and configure them. -->

<!-- ## Extension Settings

Include if your extension adds any VS Code settings through the `contributes.configuration` extension point.

For example:

This extension contributes the following settings:

* `myExtension.enable`: enable/disable this extension
* `myExtension.thing`: set to `blah` to do something -->

<!-- ## Known Issues

Calling out known issues can help limit users opening duplicate issues against your extension. -->

<!-- ## Release Notes

Users appreciate release notes as you update your extension.

### 1.0.0

Initial release of ...

### 1.0.1

Fixed issue #.

### 1.1.0

Added features X, Y, and Z. -->