import test from 'ava';
import {Base64, djb2Hash} from './DataProcessing';

test('Base64.encode', t => {
    t.is(Base64.encode('Hello World'), 'SGVsbG8gV29ybGQ=');
});

test('Base64.decode', t => {
    t.is(Base64.decode('SGVsbG8gV29ybGQ='), 'Hello World');
});

test('djb2Hash', t => {
    t.is(djb2Hash('Hello World'), 'xfy7wf');
});
