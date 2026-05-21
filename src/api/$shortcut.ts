/**
 * Contains metadata about the shortcut that was invoked in the Shortcuts event handler.
 * Use this object to inspect which shortcut was triggered. Shortcuts cannot be modified — they only provide input context for your logic.
 */
export declare class Shortcut {
    /** Unique identifier for the shortcut within the app. */
    readonly name: string;

    /** Human-readable display name of the shortcut, shown in UI. */
    readonly title: string;

    /** Optional short description of what the shortcut does, shown in the tooltip or details panel. */
    readonly description: string;
}

export declare const $shortcut: Shortcut;
