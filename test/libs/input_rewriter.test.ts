import test from 'ava';
import {InputRewriter} from '@lib/input_rewriter';

test('InputRewriter.exact rewrites exact input', t => {
    const rewriter = new InputRewriter().exact('/bar', '/foo bar');

    t.is(rewriter.rewrite('/bar'), '/foo bar');
});

test('InputRewriter.exact returns original for non-matching input', t => {
    const rewriter = new InputRewriter().exact('/bar', '/foo bar');

    t.is(rewriter.rewrite('/baz'), '/baz');
});

test('InputRewriter.prefix preserves suffix', t => {
    const rewriter = new InputRewriter().prefix('/gh ', '/github ');

    t.is(rewriter.rewrite('/gh issue 123'), '/github issue 123');
});

test('InputRewriter.prefix no-match returns original', t => {
    const rewriter = new InputRewriter().prefix('/gh ', '/github ');

    t.is(rewriter.rewrite('/xyz'), '/xyz');
});

test('InputRewriter.regex supports capture groups', t => {
    const rewriter = new InputRewriter().regex(/^\/say\s+(.+)$/, '/message $1');

    t.is(rewriter.rewrite('/say hello'), '/message hello');
});

test('InputRewriter.regex no-match returns original', t => {
    const rewriter = new InputRewriter().regex(/^\/say\s+(.+)$/, '/message $1');

    t.is(rewriter.rewrite('/say'), '/say');
});

test('InputRewriter.first matching rule wins', t => {
    const rewriter = new InputRewriter()
        .exact('/foo', '/first')
        .exact('/foo', '/second');

    t.is(rewriter.rewrite('/foo'), '/first');
});

test('InputRewriter.rewrite is non-recursive', t => {
    const rewriter = new InputRewriter()
        .exact('/foo', '/bar')
        .exact('/bar', '/baz');

    t.is(rewriter.rewrite('/foo'), '/bar');
});

test('InputRewriter.rewrite normal text transformation', t => {
    const rewriter = new InputRewriter().exact('/hi', 'hello world');

    t.is(rewriter.rewrite('/hi'), 'hello world');
});

test('InputRewriter.rewrite empty string input', t => {
    const rewriter = new InputRewriter().exact('', '/something');

    t.is(rewriter.rewrite(''), '/something');
});

test('InputRewriter no matching rule returns original', t => {
    const rewriter = new InputRewriter()
        .exact('/foo', '/bar')
        .prefix('/baz', '/qux');

    t.is(rewriter.rewrite('/nonexistent'), '/nonexistent');
});

test('InputRewriter chainable API returns this', t => {
    const rewriter = new InputRewriter();

    t.is(rewriter.exact('/a', '/b'), rewriter);
    t.is(rewriter.prefix('/c', '/d'), rewriter);
    t.is(rewriter.regex(/e/, 'f'), rewriter);
});
