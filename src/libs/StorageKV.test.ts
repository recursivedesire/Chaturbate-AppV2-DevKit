import test from 'ava';
import proxyquire from 'proxyquire';

class KvIterator {
    private kvStore: Map<string, any>;
    private prefix: string;
    private keys: string[];
    private index: number;
    private currentKey: string;

    constructor(kvStore: Map<string, any>, prefix: string = "") {
        this.kvStore = kvStore;
        this.prefix = prefix;
        this.keys = Array.from(kvStore.keys()).filter(key => key.startsWith(prefix)).sort();
        this.index = 0;
        this.currentKey = null;
    }

    next() {
        if (this.index < this.keys.length) {
            this.currentKey = this.keys[this.index++];
            return true;
        } else {
            this.currentKey = null;
            return false;
        }
    }

    key() {
        return this.currentKey;
    }

    value() {
        return this.kvStore.get(this.currentKey);
    }

    seek(key) {
        const seekIndex = this.keys.indexOf(key);
        if (seekIndex !== -1) {
            this.index = seekIndex;
            this.currentKey = this.keys[this.index];
        } else {
            throw new Error(`Key not found: ${key}`);
        }
    }

    delete() {
        if (this.currentKey) {
            this.kvStore.delete(this.currentKey);
            this.keys = this.keys.filter(k => k !== this.currentKey);
            this.index--; // adjust index to maintain iteration consistency
            return true;
        }
        return false;
    }
}

class KV {
    private store: Map<string, any>;

    constructor() {
        this.store = new Map();
    }

    clear() {
        this.store.clear();
        return true;
    }

    decr(key, amount = 1) {
        if (key.length > 256) return false;
        if (this.store.has(key)) {
            let current = this.store.get(key);
            if (typeof current === 'number') {
                this.store.set(key, current - amount);
                return true;
            } else {
                return false;
            }
        } else {
            return false;
        }
    }

    get(key, defaultValue = undefined) {
        if (key.length > 256) throw new Error("Key is too long");
        if (this.store.has(key)) {
            return this.store.get(key);
        } else if (defaultValue !== undefined) {
            return defaultValue;
        } else {
            throw new Error(`Key does not exist: ${key}`);
        }
    }

    incr(key, amount = 1) {
        if (key.length > 256) return false;
        if (this.store.has(key)) {
            let current = this.store.get(key);
            if (typeof current === 'number') {
                this.store.set(key, current + amount);
                return true;
            } else {
                return false;
            }
        } else {
            return false;
        }
    }

    iter(prefix = "") {
        return new KvIterator(this.store, prefix);
    }

    remove(key) {
        this.store.delete(key);
    }

    set(key, value) {
        if (key.length > 256) return false;
        this.store.set(key, value);
        return true;
    }
}

function StorageKV($kv: KV, prefix: string = '') {
    const {StorageKV} = proxyquire('./StorageKV', {
        '../api/$kv': {$kv}
    });
    return new StorageKV(prefix);
}


test('StorageKV.set', t => {
    const $kv = new KV();
    const storage = StorageKV($kv);
    storage.set('key', 'value');
    t.is($kv.get('key'), 'value');
});

test('StorageKV.get', t => {
    const $kv = new KV();
    const storage = StorageKV($kv);
    $kv.set('key', 'value');
    t.is(storage.get('key'), 'value');
});

test('StorageKV.get default-value', t => {
    const $kv = new KV();
    const storage = StorageKV($kv);
    t.is(storage.get('key', 'default'), 'default');
});

test('StorageKV.remove', t => {
    const $kv = new KV();
    const storage = StorageKV($kv);
    $kv.set('key', 'value');
    storage.remove('key');
    t.throws(() => $kv.get('key'));
});

test('StorageKV.clear', t => {
    const $kv = new KV();
    const storage = StorageKV($kv);
    $kv.set('key', 'value');
    storage.clear();
    t.throws(() => $kv.get('key'));
});

test('StorageKV.incr', t => {
    const $kv = new KV();
    const storage = StorageKV($kv);
    $kv.set('key', 1);
    storage.incr('key');
    t.is($kv.get('key'), 2);
});

test('StorageKV.decr', t => {
    const $kv = new KV();
    const storage = StorageKV($kv);
    $kv.set('key', 2);
    storage.decr('key');
    t.is($kv.get('key'), 1);
});

test('StorageKV.iter', t => {
    const $kv = new KV();
    const storage = StorageKV($kv);
    $kv.set('key1', 'value1');
    $kv.set('key2', 'value2');
    const iterator = storage.iter();
    t.true(iterator.next());
    t.is(iterator.key(), 'key1');
    t.is(iterator.value(), 'value1');
    t.true(iterator.next());
    t.is(iterator.key(), 'key2');
    t.is(iterator.value(), 'value2');
    t.false(iterator.next());
});

test('StorageKV json', t => {
    const $kv = new KV();
    const storage = StorageKV($kv);
    storage.set('key', {a: 1}, true);
    t.deepEqual(storage.get('key', undefined, true), {a: 1});
});

test('StorageKV namespace', t => {
    const $kv = new KV();
    const storage = StorageKV($kv, 'namespace');
    storage.set('key', 'value');
    t.is($kv.get('namespace:key'), 'value');
});

test('StorageKVList.getAll', t => {
    const $kv = new KV();
    const storage = StorageKV($kv);
    const list = storage.list('list');
    list.add('value');
    t.deepEqual(list.getAll(), ['value']);
});

test('StorageKVList.add', t => {
    const $kv = new KV();
    const storage = StorageKV($kv);
    const list = storage.list('list');
    list.add('value1');
    list.add('value2');
    t.deepEqual(list.getAll(), ['value1', 'value2']);
});

test('StorageKVList.remove', t => {
    const $kv = new KV();
    const storage = StorageKV($kv);
    const list = storage.list('list');
    list.add('value1');
    list.add('value2');
    list.remove(0);
    t.deepEqual(list.getAll(), ['value2']);
});

test('StorageKVList.clear', t => {
    const $kv = new KV();
    const storage = StorageKV($kv);
    const list = storage.list('list');
    list.add('value1');
    list.add('value2');
    list.clear();
    t.deepEqual(list.getAll(), []);
});

test('StorageKVList.defrag', t => {
    const $kv = new KV();
    const storage = StorageKV($kv);
    const list = storage.list('list');
    list.add('value1');
    list.add('value2');
    list.remove(0);
    list.defrag();
    t.deepEqual(list.getAll(), ['value2']);
});

test('StorageKVList.iter', t => {
    const $kv = new KV();
    const storage = StorageKV($kv);
    const list = storage.list('list');
    list.add('value1');
    list.add('value2');
    const iterator = list.iter();
    t.true(iterator.next());
    t.is(iterator.value(), 'value1');
    t.true(iterator.next());
    t.is(iterator.value(), 'value2');
    t.false(iterator.next());
});

test('StorageKVMap.get', t => {
    const $kv = new KV();
    const storage = StorageKV($kv);
    const map = storage.map('map', 'key');
    map.set({key: 'value1'});
    t.deepEqual(map.get('value1'), {key: 'value1'});
});

test('StorageKVMap.set', t => {
    const $kv = new KV();
    const storage = StorageKV($kv);
    const map = storage.map('map', 'key');
    map.set({key: 'value1'});
    map.set({key: 'value2'});
    t.deepEqual(map.get('value2'), {key: 'value2'});
});

test('StorageKVMap.remove', t => {
    const $kv = new KV();
    const storage = StorageKV($kv);
    const map = storage.map('map', 'key');
    map.set({key: 'value1'});
    map.set({key: 'value2'});
    map.remove('value1');
    t.throws(() => map.get('value1'));
});

test('StorageKVMap.clear', t => {
    const $kv = new KV();
    const storage = StorageKV($kv);
    const map = storage.map('map', 'key');
    map.set({key: 'value1'});
    map.set({key: 'value2'});
    map.clear();
    t.throws(() => map.get('value1'));
});

test('StorageKVMap.iter', t => {
    const $kv = new KV();
    const storage = StorageKV($kv);
    const map = storage.map('map', 'key');
    map.set({key: 'value1'});
    map.set({key: 'value2'});
    const iterator = map.iter();
    t.true(iterator.next());
    t.deepEqual(iterator.value(), {key: 'value1'});
    t.true(iterator.next());
    t.deepEqual(iterator.value(), {key: 'value2'});
    t.false(iterator.next());
});
