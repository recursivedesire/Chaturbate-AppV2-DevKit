import {$kv, KvIterator} from "../api/$kv";

function array_includes(arr: Array<any>, obj: any) {
    return arr.indexOf(obj) > -1;
}


class StorageKV {
    private readonly namespace: string;

    constructor(namespace: string = '') {
        this.namespace = namespace;
    }

    private fullKey(key: any): string {
        return (this.namespace === '') ? key : `${this.namespace}:${key}`;
    }

    set(key: string, value: any, useJson: boolean = false): boolean {
        const storedValue = useJson ? JSON.stringify(value) : value;
        return $kv.set(this.fullKey(key), storedValue);
    }

    get(key: string, defaultValue: any = undefined, useJson: boolean = false): any {
        if (useJson && defaultValue !== undefined) {
            defaultValue = JSON.stringify(defaultValue);
        }

        let value = $kv.get(this.fullKey(key), defaultValue);
        if (useJson && value !== undefined) {
            value = JSON.parse(value);
        }
        return value;
    }

    remove(key: string): void {
        $kv.remove(this.fullKey(key));
    }

    clear(): void {
        const iterator = this.iter();
        while (iterator.next()) {
            iterator.delete();
        }
    }

    incr(key: string, amount: number = 1): boolean {
        return $kv.incr(this.fullKey(key), amount);
    }

    decr(key: string, amount: number = 1): boolean {
        return $kv.decr(this.fullKey(key), amount);
    }

    iter(prefix: string = '', useJson: boolean = false): StorageKVIterator {
        return new StorageKVIterator($kv.iter(this.fullKey(prefix)), useJson);
    }

    list(key: string, useJson: boolean = false): StorageKVList {
        return new StorageKVList(this, key, useJson);
    }

    map(key: string, keyAttribute: string): StorageKVMap {
        return new StorageKVMap(this, key, keyAttribute);
    }
}

class StorageKVIterator {
    private readonly iterator: KvIterator;
    private readonly useJson: boolean;

    constructor(kvIterator: KvIterator, useJson: boolean = false) {
        this.iterator = kvIterator;
        this.useJson = useJson;
    }

    next(): boolean {
        return this.iterator.next();
    }

    key(): string {
        return this.iterator.key();
    }

    value(): any {
        const rawValue = this.iterator.value();
        return this.useJson ? JSON.parse(rawValue) : rawValue;
    }

    delete(): boolean {
        return this.iterator.delete();
    }
}

class StorageKVList {
    private readonly kv: StorageKV;
    private readonly baseKey: string;
    private readonly useJson: boolean;
    private length: number;
    private freeIndices: number[];

    constructor(kv: StorageKV, baseKey: string, useJson: boolean = false) {
        this.kv = kv;
        this.baseKey = baseKey;
        this.useJson = useJson;
        this.length = parseInt(this.kv.get(this.fullKey('count'), 0, false));
        this.freeIndices = this.loadFreeIndices();
    }

    private fullKey(key: any): string {
        return `${this.baseKey}:${key}`;
    }

    private loadFreeIndices(): number[] {
        const freeIndicesData = this.kv.get(this.fullKey('freeIndices'), '[]', false);
        return JSON.parse(freeIndicesData);
    }

    add(value: any): boolean {
        let index;
        if (this.freeIndices.length > 0) {
            index = this.freeIndices.shift();  // Reuse a free index
        } else {
            index = this.length++;
        }
        this.kv.set(`${this.baseKey}:${index}`, value, this.useJson);
        this.kv.set(this.fullKey('count'), this.length, false);
        this.kv.set(this.fullKey('freeIndices'), JSON.stringify(this.freeIndices), false);
        return true;
    }

    get(index: number): any {
        if (!array_includes(this.freeIndices, index)) {
            return this.kv.get(this.fullKey(index), undefined, this.useJson);
        }
        return undefined;  // Return undefined for "deleted" indices
    }

    getAll(): any[] {
        const items = [];
        for (let i = 0; i < this.length; i++) {
            if (!this.freeIndices.includes(i)) {
                items.push(this.get(i));
            }
        }
        return items;
    }

    remove(index: number): void {
        if (typeof index !== 'number') {
            throw new TypeError('Index must be a number');
        }

        this.freeIndices.push(index);
        this.freeIndices.sort((a, b) => a - b);  // Keep free indices sorted
        this.kv.remove(this.fullKey(index));
        this.kv.set(this.fullKey('freeIndices'), JSON.stringify(this.freeIndices), false);
    }

    defrag(): void {
        const newData = this.getAll(); // Save existing data
        this.clear();  // Clear all data
        newData.forEach(data => this.add(data));  // Re-add data compactly
    }

    clear(): void {
        for (let i = 0; i < this.length; i++) {
            this.kv.remove(this.fullKey(i));
        }
        this.length = 0;
        this.freeIndices = [];
        this.kv.set(this.fullKey('count'), this.length, false);
        this.kv.set(this.fullKey('freeIndices'), JSON.stringify(this.freeIndices), false);
    }

    iter(): StorageKVListIterator {
        return new StorageKVListIterator(this.kv, this.baseKey, this.useJson);
    }
}

class StorageKVListIterator {
    private readonly kv: StorageKV;
    private readonly baseKey: string;
    private readonly useJson: boolean;
    private index: number;
    private length: number;
    private freeIndices: number[];

    constructor(kv: StorageKV, baseKey: string, useJson: boolean) {
        this.kv = kv;
        this.baseKey = baseKey;
        this.useJson = useJson;
        this.index = 0;
        this.length = parseInt(this.kv.get(this.fullKey('count'), "0"));
        this.freeIndices = JSON.parse(this.kv.get(this.fullKey('freeIndices'), "[]"));
    }

    private fullKey(key: any): string {
        return `${this.baseKey}:${key}`;
    }

    next(): boolean {
        while (this.index < this.length) {
            if (!array_includes(this.freeIndices, this.index)) {
                return true;
            }
            this.index++;
        }
        return false;
    }

    value(): any {
        const value = this.kv.get(this.fullKey(this.index), undefined, this.useJson);
        this.index++;
        return value;
    }

    delete(): boolean {
        if (!array_includes(this.freeIndices, this.index - 1)) {
            this.kv.remove(`${this.baseKey}:${this.index - 1}`);
            this.freeIndices.push(this.index - 1);
            this.freeIndices.sort((a, b) => a - b);
            this.kv.set(this.fullKey('freeIndices'), JSON.stringify(this.freeIndices), false);
            return true;
        }
        return false;
    }
}

class StorageKVMap {
    private readonly kv: StorageKV;
    private readonly baseKey: string;
    private readonly keyAttribute: string;

    constructor(kv: StorageKV, baseKey: string, keyAttribute: string) {
        this.kv = kv;
        this.baseKey = baseKey;
        this.keyAttribute = keyAttribute;
    }

    private fullKey(key: any): string {
        return `${this.baseKey}:${key}`;
    }

    set(data: object): boolean {
        if (data[this.keyAttribute] === undefined) {
            console.error(`Key '${this.keyAttribute}' does not exist in data object`);
            return false;
        }
        const key = data[this.keyAttribute];
        return this.kv.set(this.fullKey(key), data, true);
    }

    get(key: string, defaultValue: any = undefined): any {
        return this.kv.get(this.fullKey(key), defaultValue, true);
    }

    remove(key: string): void {
        this.kv.remove(this.fullKey(key));
    }

    clear(): void {
        const iterator = this.iter();
        while (iterator.next()) {
            iterator.delete();
        }
    }

    iter(): StorageKVMapIterator {
        return new StorageKVMapIterator(this.kv.iter(this.baseKey + ':'));
    }
}

class StorageKVMapIterator {
    private readonly iterator: StorageKVIterator;

    constructor(kvIterator: StorageKVIterator) {
        this.iterator = kvIterator;
    }

    next(): boolean {
        return this.iterator.next();
    }

    key(): string {
        return this.iterator.key();
    }

    value(): any {
        const rawValue = this.iterator.value();
        return JSON.parse(rawValue);
    }

    delete(): boolean {
        return this.iterator.delete();
    }
}


export {StorageKV, StorageKVIterator, StorageKVList, StorageKVListIterator, StorageKVMap, StorageKVMapIterator};
