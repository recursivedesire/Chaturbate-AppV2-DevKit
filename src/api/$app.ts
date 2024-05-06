export declare class AppPermissions {
    /** True if broadcaster has granted the Transform messages permission. */
    readonly chatMessageTransform: boolean;

    /** True if broadcaster has granted the Broadcast panel permission. */
    readonly broadcastPanelUpdate: boolean;

    /** True if broadcaster has granted the Tip options permission. */
    readonly tipDialogOpen: boolean;
}


/**
 * Holds meta information about app.
 */
export declare class AppInfo {
    /** Description of app. */
    readonly description: string;

    /** Can be used to emit events to web components. This method is available only in event handlers */
    emit(eventName: string, payload: any): void;

    /** Name of app. */
    readonly name: string;

    /** Can be used to receive events in web components. This method is available only in web components. */
    on(eventName: string, callback: (payload: any) => void): void;

    /** Object displays values of broadcaster's permissions. */
    readonly permission: AppPermissions;

    /** Summary of app. */
    readonly summary: string;

    /** Version of app. */
    readonly version: string;
}

export declare const $app: AppInfo;
