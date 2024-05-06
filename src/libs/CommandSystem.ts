import {$user} from "../api/$user";


type TCommandHandler = (args: TObjectKV, opts: TObjectKV) => TCommandResult;
type TObjectKV = Record<string, any>;

type TCommand = Command | CommandSystem;

type TCommandResult = {
    success: boolean;
    message: string;
    data?: any;
};

type TMatch = { match: TCommand | Parameter } | { error: string };

type TParsedCommand = {
    valid: true;
    command: TCommand;
    args: TObjectKV;
    opts: TObjectKV;
} | { valid: false; error: string };


class Parameter {
    readonly name: string;
    readonly defaultValue?: any;
    readonly regex: RegExp;
    readonly isVarArgOrFlag: boolean;

    constructor(name: string, defaultValue: any = undefined, regex: RegExp = /.*/, isVarArgOrFlag: boolean = false) {
        this.name = name;
        this.defaultValue = defaultValue;
        this.regex = regex;
        this.isVarArgOrFlag = isVarArgOrFlag;
    }

    validate(value: string): boolean {
        return this.regex.test(value);
    }
}

class Command {
    readonly name: string;
    readonly description: string;
    readonly handler: TCommandHandler;
    readonly args: Parameter[];
    readonly opts: Parameter[];
    permissions: string[];

    constructor(name: string, description: string, permissions: string[], handler: TCommandHandler, args: Parameter[] = [], opts: Parameter[] = []) {
        this.name = name;
        this.description = description;
        this.permissions = permissions;
        this.handler = handler;
        this.args = args;
        this.opts = opts;
    }

    help(showDetails: boolean): string {
        const commandSyntax = `${this.name} ${this.args.map(a => `<${a.name}>`).join(' ')} ${this.opts.map(o => `[-${o.name}]`).join(' ')}`;
        const commandDescription = this.description;
        const argDescriptions = "Arguments: " + this.args.map(a => a.name).join(', ');
        const optDescriptions = "Options: " + this.opts.map(o => o.defaultValue ? `${o.name} (${o.defaultValue})` : o.name).join(', ');
        return showDetails ? `${commandSyntax}\n${commandDescription}\n${argDescriptions}\n${optDescriptions}` : `${this.name}: ${this.description}`;
    }

    execute(args: TObjectKV, opts: TObjectKV): TCommandResult {
        try {
            return this.handler(args, opts);
        } catch (error) {
            console.log(`Error executing command '${this.name}':`, error);
            return {success: false, message: `An error occurred while executing the command.`};

        }
    }

}

function matchByName(name: string, list: (TCommand | Parameter)[]): TMatch {
    let match = list.find(i => i.name === name);
    if (!match) {
        let possibilities = list.filter(i => i.name.startsWith(name));
        if (possibilities.length === 1) {
            match = possibilities[0];
        } else if (possibilities.length > 1) {
            return {error: `Ambiguous name, could be any of: ${possibilities.map(i => i.name).join(', ')}`};
        }
    }
    return {match};
}

class CommandSystem {
    readonly name: string;
    readonly commands: Record<string, TCommand> = {};
    prefix: string;
    permissions: string[] = [];

    constructor(name: string) {
        this.name = name;
        this.prefix = name;
        this.register(new Command(
            "help", "Displays a list of available commands or details about a specific command.",
            [], (args) => ({success: true, message: this.help(false, args.command)}), [], []
        ));
    }

    register(...commands: TCommand[]): void {
        for (let command of commands) {
            if (command instanceof CommandSystem) {
                command.prefix = `${this.prefix} ${command.prefix}`;
            }
            this.commands[command.name] = command;
        }
    }

    unregister(...commands: TCommand[]): void {
        for (let command of commands) {
            delete this.commands[command.name];
        }
    }

    help(showDetails: boolean = false, commandName?: string): string {
        if (commandName) {
            if (this.commands[commandName]) {
                return this.commands[commandName].help(showDetails);
            } else {
                return 'Command not found';
            }
        } else {
            let commands = Object.values<TCommand>(this.commands).filter(c => this.hasPermission(c));
            return commands.map(c => (c instanceof CommandSystem) ? c.help() : `${this.prefix} ${c.help(false)}`).join('\n');
        }
    }

    parse(commandString: string): TParsedCommand {
        try {
            if (!commandString.startsWith(this.name)) {
                throw new Error('Invalid command prefix');
            }

            const withoutPrefix = commandString.slice(this.name.length).trim();
            const segments = withoutPrefix.match(/(".*?"|[^"\s]+)+(?=\s*|\s*$)/g) || [];
            let commandName = segments[0] || "help";
            let tokens = segments.slice(1).map(s => s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s);

            let commandMatch = matchByName(commandName, Object.values(this.commands));
            if ('error' in commandMatch) {
                throw new Error(commandMatch.error);
            }

            let command = commandMatch.match as TCommand;
            if (!command) {
                throw new Error(`Unknown command "${commandName}"`);
            }

            if (!this.hasPermission(command)) {
                throw new Error(`You do not have permission to execute the "${commandName}" command.`);
            }

            if (command instanceof CommandSystem) {
                return command.parse(withoutPrefix);
            }

            let opts: TObjectKV = {};
            let args: TObjectKV = {};
            let remainingTokens: string[] = [];

            for (let i = 0; i < tokens.length; i++) {
                let token = tokens[i];
                if (token.startsWith('-')) {
                    let optName = token.slice(token.startsWith('--') ? 2 : 1);
                    let optMatch = matchByName(optName, command.opts);
                    if ('error' in optMatch) {
                        throw new Error(optMatch.error);
                    }

                    let opt = optMatch.match as Parameter;
                    if (opt.isVarArgOrFlag) {
                        opts[optName] = true;
                    } else {
                        i++;
                        if (i >= tokens.length) {
                            throw new Error(`Option "${optName}" expects a value but none was provided.`);

                        }
                        opts[optName] = tokens[i];
                    }
                } else {
                    remainingTokens.push(token);
                }
            }

            command.opts
                .filter(opt => opts[opt.name] === undefined)
                .forEach(opt => opts[opt.name] = opt.defaultValue);

            if (remainingTokens.length > command.args.length) {
                throw new Error(`Too many arguments provided. Expected ${command.args.length} but got ${remainingTokens.length}.`);
            }

            for (let i = 0; i < command.args.length; i++) {
                let arg = command.args[i];

                if (i >= remainingTokens.length && arg.defaultValue === undefined) {
                    throw new Error(`Missing argument "${arg.name}".`);
                }

                if (i < remainingTokens.length) {
                    if (!arg.validate(remainingTokens[i])) {
                        throw new Error(`Invalid value "${remainingTokens[i]}" for argument "${arg.name}".`);
                    }
                    args[arg.name] = remainingTokens[i];
                } else {
                    args[arg.name] = arg.defaultValue;
                }
            }

            return {valid: true, command: command, args, opts};
        } catch (err) {
            return {valid: false, error: err.message};
        }
    }

    private hasPermission(command: TCommand): boolean {
        return command.permissions.length === 0 || command.permissions.some(perm => perm === $user.username || perm === $user.colorGroup);
    }

    execute(commandStringOrParsed: string | TParsedCommand): TCommandResult {
        let parsed;
        if (typeof commandStringOrParsed === 'string') {
            parsed = this.parse(commandStringOrParsed);
        } else {
            parsed = commandStringOrParsed;
        }
        if (parsed.valid) {
            return parsed.command.execute(parsed.args, parsed.opts);
        } else {
            return parsed.error;
        }
    }
}


export {CommandSystem, Command, Parameter, TCommandHandler};
