import * as vscode from "vscode";
import * as htmlParser from "node-html-parser";
import * as tsParser from "@typescript-eslint/typescript-estree";
import { ClassDeclaration, LineAndColumnData, } from "@typescript-eslint/types/dist/ts-estree";
import { AST_NODE_TYPES } from "@typescript-eslint/types/dist/ast-node-types";
import { AST_TOKEN_TYPES } from "@typescript-eslint/types/dist/ast-token-types";
import * as path from "path";
import * as fs from "fs";

const COMMAND = "queryselector-completion.addPrivateProperty";

function isWithin(pos: vscode.Position, start: LineAndColumnData, end: LineAndColumnData) {
	return ((pos.line + 1) > start.line || (pos.character >= start.column && (pos.line + 1) === start.line)) &&
		(end.line > (pos.line + 1) || (end.line === (pos.line + 1) && end.column >= pos.character));
}

function getHtmlImportFile(code: string) {
	let htmlImportRegex = /import.+?from.+("|')(.+\.html)('|")/.exec(code);
	if (null !== htmlImportRegex) {
		return htmlImportRegex[2];
	}
	else {
		return null;
	}
}

function readAndParseHtml(code: string, filename: string): { success: true, htmlDocument: htmlParser.HTMLElement } |
{ success: false, notfound?: boolean, htmlFile?: string } {
	let htmlImportFile = getHtmlImportFile(code);
	if (null === htmlImportFile) {
		console.error("no html import file found");
		return { success: false };
	}
	let htmlFile = path.join(path.dirname(filename), htmlImportFile);
	if (!fs.existsSync(htmlFile)) {
		return { success: false, notfound: true, htmlFile: htmlFile };
	}
	let htmlContent = fs.readFileSync(htmlFile, { encoding: "utf8" });
	let htmlDocument = htmlParser.parse(htmlContent);
	return { success: true, htmlDocument };
}

function getTypeFromElement(node: htmlParser.HTMLElement) {
	return `HTML${node.tagName.substr(0, 1).toUpperCase()}${node.tagName.substr(1).toLowerCase()}Element`;
}

function getQuerySelector(line: string) {
	const qsToken = "querySelector";
	let qsIndex = line.indexOf(qsToken);
	if (qsIndex < 0) {
		return null;
	}
	let quoteType: string | null = null;
	let startQuoteIndex: number = qsIndex + qsToken.length;
	let endQuoteIndex: number | null = null;
	for (let i = qsIndex; i < line.length; i++) {
		if (null === quoteType) {
			if (/["'`]/.exec(line[i])) {
				startQuoteIndex = i;
				quoteType = line[i];
			}
		}
		else {
			if (quoteType === line[i]) {
				endQuoteIndex = i;
			}
		}
	}
	let textWithinQuotes = endQuoteIndex ? line.substr(startQuoteIndex + 1, endQuoteIndex - startQuoteIndex - 1) : line.substr(startQuoteIndex + 1);
	return {
		textWithinQuotes,
		quoteType,
		startQuoteIndex,
		endQuoteIndex
	};
}

class DocumentTraverser<TReturn extends any[]> {
	private _checkFns: ((node: htmlParser.HTMLElement) => any)[];


	constructor(checkFns?: ((node: htmlParser.HTMLElement) => any)[]) {
		this._checkFns = checkFns || [];
	}

	addCheckFn<TCheckReturn>(check: (node: htmlParser.HTMLElement) => TCheckReturn | null): DocumentTraverser<[...TReturn, TCheckReturn[]]> {
		return new DocumentTraverser([...this._checkFns, check]);
	}

	traverse(d: htmlParser.HTMLElement): TReturn {
		let res: any[] = [];
		for (let c of this._checkFns) {
			let thisres = c(d);
			let thisr = thisres ? [thisres] : [];
			res.push(thisr);
		}
		let children = d.childNodes.filter(c => c.nodeType === htmlParser.NodeType.ELEMENT_NODE) as htmlParser.HTMLElement[];
		let childResults = children.map(c => this.traverse(c));
		for (let cres of childResults) {
			for (let i = 0; i < this._checkFns.length; i++) {
				res[i] = [...res[i], ...cres[i]];
			}
		}
		return <TReturn>res;
	}
}


export function activate(context: vscode.ExtensionContext) {

	context.subscriptions.push(
		vscode.languages.registerCodeActionsProvider("typescript", new GeneratePropertyForHtmlElement(), {
			providedCodeActionKinds: GeneratePropertyForHtmlElement.providedCodeActionKinds
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(COMMAND, (diagnostic: vscode.Diagnostic) => {
			const activeEditor = vscode.window.activeTextEditor;
			if (!activeEditor) {
				return;
			}
			let code = activeEditor.document.getText();
			let ast = null;
			try {
				ast = tsParser.parse(code, {
					loc: true,
					tokens: true
				});
			}
			catch (e) {
				vscode.window.showErrorMessage("Could not parse document");
				console.error("Could not parse document", e);
				return;
			}
			let position: vscode.Position;
			if (activeEditor.selection.isEmpty) {
				position = activeEditor.selection.active;
			}
			else {
				position = activeEditor.selection.start;
			}
			let classdeclarations = ast.body.filter(v => v.hasOwnProperty("declaration") && (<any>v).declaration.type === tsParser.AST_NODE_TYPES.ClassDeclaration)
				.map(v => (<any>v).declaration as ClassDeclaration);
			let classdec = classdeclarations.find(v => isWithin(position, v.loc.start, v.loc.end));
			if (!classdec) {
				vscode.window.showErrorMessage("Not within a top level class declaration");
				return;
			}
			let classProperties = classdec.body.body.filter(e => e.type === AST_NODE_TYPES.ClassProperty);
			let insertline = classdec.loc.start.line;
			let insertColumn = classdec.loc.start.column + 4;
			if (classProperties.length) {
				let lastProp = classProperties[classProperties.length - 1];
				insertline = lastProp.loc.start.line;
				insertColumn = lastProp.loc.start.column;
			}
			let edit = new vscode.WorkspaceEdit();
			let res = readAndParseHtml(code, activeEditor.document.fileName);
			if (!res.success) {
				if (res.notfound) {
					vscode.window.showErrorMessage(`Html file ${res.htmlFile} was not found.`);
				}
				return;
			}
			let querySelector = getQuerySelector(activeEditor.document.lineAt(diagnostic.range.start.line).text);
			if (null === querySelector) {
				console.error("no query selector");
				return;
			}
			let node = res.htmlDocument.querySelector(querySelector.textWithinQuotes);
			if (!node) {
				vscode.window.showErrorMessage(`Nothing found for query selector ${querySelector}`);
				return;
			}
			let token = ast.tokens.find(t => isWithin(diagnostic.range.start, t.loc.start, t.loc.end) && t.type === AST_TOKEN_TYPES.Identifier);
			if (!token) {
				vscode.window.showErrorMessage("Token not found");
				return;
			}
			edit.insert(activeEditor.document.uri, new vscode.Position(insertline, 0), `${" ".repeat(insertColumn)}private ${token.value} : ${getTypeFromElement(node)};\n`);
			vscode.workspace.applyEdit(edit);
		})
	);

	context.subscriptions.push(vscode.languages.registerCompletionItemProvider(["typescript", "javascript"], {

		provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext) {


			let line = document.lineAt(position).text;
			const linePrefix = line.substr(0, position.character);
			let regexes = [/querySelector\s*\(\s*["][^)"]*$/, /querySelector\s*\(\s*['][^)']*$/, /querySelector\s*\(\s*[`][^)`]*$/];
			if (!regexes.some(r => linePrefix.match(r))) {
				return undefined;
			}
			let qsRegex = /querySelector\s*\(\s*["'`](.*)/.exec(linePrefix);
			if (qsRegex === null) {
				return undefined;
			}
			let res = readAndParseHtml(document.getText(), document.fileName);
			if (!res.success) {
				return undefined;
			}

			let querySelector = getQuerySelector(line);
			if (!querySelector) {
				return undefined;
			}
			let { startQuoteIndex, endQuoteIndex, textWithinQuotes, quoteType } = querySelector;

			let completionItems: vscode.CompletionItem[] = [];
			let completionRange = new vscode.Range(position.line, startQuoteIndex + 1, position.line, endQuoteIndex ? endQuoteIndex : startQuoteIndex + 2);
			let completionRangeWithEndQuote = new vscode.Range(position.line, startQuoteIndex + 1, position.line, endQuoteIndex ? endQuoteIndex + 1 : startQuoteIndex + 2);

			let traverser = new DocumentTraverser<[]>()
				.addCheckFn<string>(el => {
					if (el.id) {
						return el.id;
					}
					return null;
				})
				.addCheckFn(el => {
					return Object.entries(el.attributes).filter(e => ["data", "test"].some(ex => e[0].startsWith(ex)));
				});
			let [ids, atts] = traverser.traverse(res.htmlDocument);
			let idset = new Set(ids);
			for (let id of idset) {
				let item = new vscode.CompletionItem(`#${id}`, vscode.CompletionItemKind.Value);
				item.range = completionRange;
				if (textWithinQuotes.startsWith("#")) {
					item.sortText = item.filterText = `#${id}`;
				}
				else {
					item.sortText = item.filterText = id;
				}
				completionItems.push(item);
			}

			function flattenOne<T>(arr: Array<Array<T>>) {
				return arr.reduce((a, b) => a.concat(b), []);
			}

			let attributes = new Map(flattenOne(atts).map(([k, v]) => [`${k}${v}`, [k, v]]));
			for (let [_, [attKey, attValue]] of attributes.entries()) {
				let item = new vscode.CompletionItem(`[${attKey}="${attValue}"]`, vscode.CompletionItemKind.Value);
				item.label = `[${attKey}="${attValue}"]`;
				item.insertText = `[${attKey}="${attValue}"]` + "`";
				if (textWithinQuotes.startsWith("[")) {
					item.sortText = item.filterText = `[${attKey}="${attValue}"]`;
				}
				else {
					item.sortText = item.filterText = `${attKey}="${attValue}"`;
				}
				item.range = completionRangeWithEndQuote;
				item.additionalTextEdits = [];
				if (quoteType === "'" || quoteType === "\"") {
					item.additionalTextEdits.push(vscode.TextEdit.replace(new vscode.Range(position.line, startQuoteIndex, position.line, startQuoteIndex + 1), "`"));
				}
				completionItems.push(item);
			}

			return { isIncomplete: false, items: completionItems };
		}
	}, "\"", "'", "#", "`"));
}

export class GeneratePropertyForHtmlElement implements vscode.CodeActionProvider {

	public static readonly providedCodeActionKinds = [
		vscode.CodeActionKind.QuickFix
	];

	provideCodeActions(document: vscode.TextDocument, range: vscode.Range | vscode.Selection, context: vscode.CodeActionContext, token: vscode.CancellationToken): vscode.CodeAction[] {
		let missingPropDiagnostics = context.diagnostics
			.filter(diagnostic => ["2339", "2551"].find(code => String(diagnostic.code) === code) !== null);
		if (missingPropDiagnostics.length > 0) {
			let querySelector = getQuerySelector(document.lineAt(range.start.line).text);
			if (querySelector) {
				let selectorText = querySelector.textWithinQuotes;
				let htmlImportFile = getHtmlImportFile(document.getText());
				if (null !== htmlImportFile) {
					return missingPropDiagnostics.map(d => this.createCommandCodeAction(d, selectorText));
				}
			}
		}
		return [];
	}

	private createCommandCodeAction(diagnostic: vscode.Diagnostic, querySelector: string): vscode.CodeAction {
		let title = `Add private property for "${querySelector}"`;
		const action = new vscode.CodeAction(title, vscode.CodeActionKind.Empty);
		action.command = {
			command: COMMAND, title: title, tooltip: "This will add a private property to your class declaration with the respective type",
			arguments: [diagnostic]
		};
		action.diagnostics = [diagnostic];
		return action;
	}
}

export function deactivate() { }
