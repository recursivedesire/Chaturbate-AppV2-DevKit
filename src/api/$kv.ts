export declare class KvIterator {
    /**
     * Fetches the next key and returns true if a key has been fetched.
     * Must be called before the key() and value() methods.
     */
    next(): boolean;

    /** Retrieves the current key. */
    key(): string;

    /** Retrieves the current value. */
    value(): any;

    /**
     * Moves the cursor to the specified key.
     * @param key The key to seek to.
     */
    seek(key: string);

    /**
     * Deletes the current entry.
     * @returns true if operation succeeded, false if key is too long.
     */
    delete(): boolean;
}

export declare class KV {
    /**
     * Clear all entries from the KV store.
     * @returns Returns true if operation succeeded.
     */
    clear(): boolean;

    /**
     * Decrease a stored integer value by an amount.
     * @param key The storage key holding the integer you want to decrement. The max length is 256 characters.
     * @param amount The amount you want to decrement the stored integer by. Default value of 1.
     * @returns true if operation succeeded, false if key is too long or other technical failure.
     */
    decr(key: string, amount?: number): boolean;

    /**
     * Retrieve a stored value by key.
     * @param key The storage key. The max length is 256 characters.
     * @param defaultValue The default value to return if the key does not exist.
     * @returns The stored or default value (if provided)
     * @throws error if a given key does not exist and no default value is provided.
     */
    get(key: string, defaultValue?: string): any;

    /**
     * Increase a stored integer value by an amount.
     * @param key The storage key holding the integer you want to increment. The max length is 256 characters.
     * @param amount The amount you want to increment the stored integer by. Default value of 1.
     * @returns true if operation succeeded, false if key is too long or other technical failure.
     */
    incr(key: string, amount?: number): boolean;

    /**
     * Retrieve an iterator that iterates over all KV store entries.
     * @param prefix An optional parameter to filter keys by prefix
     */
    iter(prefix?: string) : KvIterator;

    /**
     * Remove a key and value.
     * @param key The storage key to be removed from storage.
     */
    remove(key: string);

    /**
     * Store a value on a key.
     * @param key The storage key. The max length is 256 characters.
     * @param value The value you want to store on this key. Any serializable javascript is valid. The maximum size is 5MB.
     * @param expire Number of seconds after which the key should expire.
     * @returns true if operation succeeded, false if key is too long or other technical failure.
     */
    set(key: string, value: any, expire?: number): boolean;
}

export declare const $kv: KV;
