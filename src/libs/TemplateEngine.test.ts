import test from 'ava';
import { TemplateEngine} from "./TemplateEngine";

// Demo data
const arrayExample = ['Foo', 'Bar', 'Baz'];
const objectExample = {
    foo: {
        bar: 'baz'
    },
    bar: true,
    baz: 'qux'
};

test('TemplateEngine.render numeric placeholders', t => {
    t.is(TemplateEngine.render('Hello {0}, {1}, {2}', arrayExample), 'Hello Foo, Bar, Baz');
});

test('TemplateEngine.render non-sequential numeric placeholders', t => {
    t.is(TemplateEngine.render('Hello {2} {0}', arrayExample), 'Hello Baz Foo');
});

test('TemplateEngine.render non-existing numeric placeholder', t => {
    t.is(TemplateEngine.render('Hello {3}', arrayExample), 'Hello {3}');
});

test('TemplateEngine.render nested object properties', t => {
    t.is(TemplateEngine.render('Hello {foo.bar}', objectExample), 'Hello baz');
});

test('TemplateEngine.render boolean value', t => {
    t.is(TemplateEngine.render('Hello {bar}', objectExample), 'Hello true');
});

test('TemplateEngine.render conditional value', t => {
    t.is(TemplateEngine.render('Hello {bar?Yes:No}', objectExample), 'Hello Yes');
});

test('TemplateEngine.render default value', t => {
    t.is(TemplateEngine.render('Hello {baz?:Default}', objectExample), 'Hello qux');
});

test('TemplateEngine.render default value for non-existing key', t => {
    t.is(TemplateEngine.render('Hello {notExisting?:Default}', objectExample), 'Hello Default');
});

test('TemplateEngine.render empty default value', t => {
    t.is(TemplateEngine.render('Hello {notExisting?:}', objectExample), 'Hello ');
});

test('TemplateEngine.render non-existing key', t => {
    t.is(TemplateEngine.render('Hello {notExisting}', objectExample), 'Hello {notExisting}');
});

test('TemplateEngine.render nested conditional value', t => {
    t.is(TemplateEngine.render('Hello {bar?{foo.bar}}', objectExample), 'Hello baz');
});
