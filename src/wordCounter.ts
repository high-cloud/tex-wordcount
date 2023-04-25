import * as vscode from 'vscode';
import * as util from 'util';
import * as cp from 'child_process';

import { hasTexId } from './util';
import { utils } from 'mocha';
import path = require('path');

interface TexCount {
    words: {
        body: number
        headers: number
        captions: number
    }
    instances: {
        headers: number
        floats: number
        math: {
            inline: number
            displayed: number
        }
    }
}
export class WordCounter {
    status: vscode.StatusBarItem;
    logPanel: vscode.OutputChannel;

    constructor(logPanel: vscode.OutputChannel) {
        this.status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, -100);
        this.logPanel = logPanel;
        this.setStatus();
    }


    async setStatus() {
        this.addLogMessage("setStatus");
        if (
            vscode.window.activeTextEditor === undefined ||
            !hasTexId(vscode.window.activeTextEditor.document.languageId)
        ) {
            this.status.hide();
            return;
        } else {
            const template = vscode.workspace.getConfiguration('tex-wordcount.countWord').get<string>('template') as string;
            const texCount = await this.counts(false, vscode.window.activeTextEditor.document.fileName);
            this.status.show();
            this.status.text = this.format(texCount, template);
        }
    }

    async counts(merge = true, file = vscode.window.activeTextEditor?.document.fileName): Promise<TexCount | undefined> {
        if (file === undefined) {
            this.addLogMessage('A valid file was not give for TexCount');
            return;
        }

        const configuration = vscode.workspace.getConfiguration('tex-wordcount.countWord');
        const args = (configuration.get('args') as string[]).slice();
        const execFile = util.promisify(cp.execFile);

        if (merge) {
            args.push('-merge');
        }
        args.push('-brief');
        let command = configuration.get('path') as string;

        if (command === undefined) {
            command = "texcount";
        }

        this.addLogMessage(`texcoujnt args: ${args}`);
        let stdout; let stderr;
        try {
            ({ stdout, stderr } = await execFile(command, args.concat([path.basename(file)]), {
                cwd: path.dirname(file)
            }));
        } catch (err) {
            this.addLogMessage(`cannot count words: ${err}, ${stderr}`);
            this.showErrorMessage('texCount failed. Please refer to the output for details');
            return undefined;
        }


        const stdoutWord = stdout
            .replace(/\(errors:\d+\)/, '')
            .split('\n')
            .map(l => l.trim())
            .filter(l => l !== '')
            .slice(-1)[0];

        return this.parseTexCount(stdoutWord);
    }


    parseTexCount(word: string): TexCount {
        const regMatchWord = /^(?<wordsBody>\d+)\+(?<wordsHeaders>\d+)\+(?<wordsCaptions>\d+) \((?<instancesHeaders>\d+)\/(?<instancesFloats>\d+)\/(?<mathInline>\d+)\/(?<mathDisplayed>\d+)\)/.exec(
            word
        );

        if (regMatchWord !== null && regMatchWord !== null) {
            const {
                groups: {
                    /* eslint-disable @typescript-eslint/ban-ts-comment */
                    // @ts-ignore: ts _should_ be better with regex groups, but it isn't (yet)
                    wordsBody,
                    // @ts-ignore: ts _should_ be better with regex groups, but it isn't (yet)
                    wordsHeaders,
                    // @ts-ignore: ts _should_ be better with regex groups, but it isn't (yet)
                    wordsCaptions,
                    // @ts-ignore: ts _should_ be better with regex groups, but it isn't (yet)
                    instancesHeaders,
                    // @ts-ignore: ts _should_ be better with regex groups, but it isn't (yet)
                    instancesFloats,
                    // @ts-ignore: ts _should_ be better with regex groups, but it isn't (yet)
                    mathInline,
                    // @ts-ignore: ts _should_ be better with regex groups, but it isn't (yet)
                    mathDisplayed
                    /* eslint-enable @typescript-eslint/ban-ts-comment */
                }
            } = regMatchWord;

            return {
                words: {
                    body: parseInt(wordsBody),
                    headers: parseInt(wordsHeaders),
                    captions: parseInt(wordsCaptions)
                },
                instances: {
                    headers: parseInt(instancesHeaders),
                    floats: parseInt(instancesFloats),
                    math: {
                        inline: parseInt(mathInline),
                        displayed: parseInt(mathDisplayed)
                    }
                }
            };
        } else {
            throw new Error('String was not valid TexCount output');
        }
    }

    format(texCount: TexCount| undefined, template: string){
        if(texCount === undefined){
            return "...";
        }

        const replacements: { [placeholder: string]: number } = {
            '${wordsBody}': texCount.words.body,
            '${wordsHeaders}': texCount.words.headers,
            '${wordsCaptions}': texCount.words.captions,
            '${words}': texCount.words.body + texCount.words.headers + texCount.words.captions,
            '${headers}': texCount.instances.headers,
            '${floats}': texCount.instances.floats,
            '${mathInline}': texCount.instances.math.inline,
            '${mathDisplayed}': texCount.instances.math.displayed,
            '${math}': texCount.instances.math.inline + texCount.instances.math.displayed
        };
        
        for( const placeholder in replacements){
            template = template.replace(placeholder, replacements[placeholder].toString());
        }
        return template;
    }

    addLogMessage(message: string) {
        this.logPanel.append(`[${new Date().toLocaleTimeString('en-US', { hour12: false })}] ${message}\n`);
    }

    showErrorMessage(message: string, ...args: any) {
        return vscode.window.showErrorMessage(message, ...args);

    }
}