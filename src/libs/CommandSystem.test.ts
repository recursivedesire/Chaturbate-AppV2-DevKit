import test from 'ava';
import proxyquire from 'proxyquire';

import {User} from "../api/$user";

const $user: User = {username: 'Foo', colorGroup: 'f'} as User;

const {CommandSystem, Command, Parameter} = proxyquire('./CommandSystem', {
    '../api/$user': {$user}
});

test('CommandSystem can register a command', t => {
    const system = new CommandSystem('test');
    const cmd = new Command('hello', 'Say hello', [], () => ({ success: true, message: 'Hello!' }));
    system.register(cmd);

    t.true(system.commands['hello'] !== undefined);
});

test('CommandSystem can unregister a command', t => {
    const system = new CommandSystem('test');
    const cmd = new Command('hello', 'Say hello', [], () => ({ success: true, message: 'Hello!' }));
    system.register(cmd);
    system.unregister(cmd);

    t.true(system.commands['hello'] === undefined);
});

test('CommandSystem can parse valid commands', t => {
    const system = new CommandSystem('test');
    const cmd = new Command('hello', 'Say hello', [], () => ({ success: true, message: 'Hello!' }));
    system.register(cmd);

    const parsed = system.parse('test hello');
    t.true(parsed.valid);
    t.is(parsed.command, cmd);
});

test('CommandSystem checks user permissions correctly', t => {
    const system = new CommandSystem('test');
    const cmd = new Command('restricted', 'Restricted command', ['Bar'], () => ({ success: true, message: 'Secret!' }));
    system.register(cmd);

    const parsed = system.parse('test restricted');
    t.false(parsed.valid);
    t.is(parsed.error, 'You do not have permission to execute the "restricted" command.');
});

test('CommandSystem executes commands correctly', t => {
    const system = new CommandSystem('test');
    const cmd = new Command('hello', 'Say hello', [], () => ({ success: true, message: 'Hello!' }));
    system.register(cmd);

    const result = system.execute('test hello');
    t.true(result.success);
    t.is(result.message, 'Hello!');
});

test('Parameters can validate inputs correctly', t => {
    const param1 = new Parameter('age', undefined, /^\d+$/, false);

    t.true(param1.validate('25')); // Valid age as number
    t.false(param1.validate('twenty-five')); // Invalid age as string
});

test('CommandSystem parses commands with parameters correctly', t => {
    const system = new CommandSystem('test');
    const param = new Parameter('name');
    const cmd = new Command('greet', 'Greet someone', [], (args) => ({ success: true, message: `Hello, ${args.name}!` }), [param]);
    system.register(cmd);

    const parsed = system.parse('test greet Alice');
    t.true(parsed.valid);
    t.is(parsed.args.name, 'Alice');
});

test('CommandSystem parses commands with options correctly', t => {
    const system = new CommandSystem('test');
    const opt = new Parameter('loudly', false, /.*/, true);
    const cmd = new Command('shout', 'Shout a message', [], (args, opts) => {
        const message = opts.loudly ? 'HELLO!' : 'Hello!';
        return { success: true, message };
    }, [], [opt]);
    system.register(cmd);

    const parsed = system.parse('test shout -loudly');
    t.true(parsed.valid);
    t.true(parsed.opts.loudly);

    const result = system.execute(parsed);
    t.is(result.message, 'HELLO!');
});

test('Nested CommandSystem executes correctly', t => {
    const parentSystem = new CommandSystem('parent');
    const childSystem = new CommandSystem('child');
    const cmd = new Command('sayHi', 'Say hi', [], () => ({ success: true, message: 'Hi!' }));

    childSystem.register(cmd);
    parentSystem.register(childSystem);

    const result = parentSystem.execute('parent child sayHi');
    t.true(result.success);
    t.is(result.message, 'Hi!');
});

test('CommandSystem returns help correctly', t => {
    const system = new CommandSystem('test');
    const cmd = new Command('hello', 'Say hello', [], () => ({ success: true, message: 'Hello!' }));
    system.register(cmd);

    const helpMsg = system.help(false, 'hello');
    t.is(helpMsg, 'hello: Say hello');
});

test('CommandSystem handles ambiguous commands correctly', t => {
    const system = new CommandSystem('test');
    system.register(new Command('listA', 'List A items', [], () => {}));
    system.register(new Command('listB', 'List B items', [], () => {}));

    const parsed = system.parse('test list');
    t.false(parsed.valid);
    t.is(parsed.error, 'Ambiguous name, could be any of: listA, listB');
});
