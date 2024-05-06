/**
 * The callback system lets you create a callback which executes a function or specified piece of code once the callback expires. You can optionally make this call repeat indefinitely (for as long as your app is running).
 * In common javascript environments, the commands setTimeout() and setInterval() are used to achieve this. These commands are not avaialble to Chaturbate Apps, and the callback system provides support for the same functionality.
 */
export declare class Callback {
    /** The label argument, previously given to the $callback.create() method. Available only on the Callback event handler. */
    readonly label: string;

    /**
     * Cancel a callback after it has been set.
     * @param label Name of then event to be canceled.
     */
    cancel: (label: string) => void;

    /**
     * Schedule a callback to be fired with a certain label, after a period of time.
     * @param label Name of your event, use this to identify incoming callbacks.
     * @param delay The amount of seconds to wait before firing your event. Minimum value of 1. Default value of 1.
     * @param repeating Whether the event should repeat at the specified interval. Default value of false.
     */
    create: (label: string, delay?: number, repeating?: boolean) => void;
}

export declare const $callback: Callback;
