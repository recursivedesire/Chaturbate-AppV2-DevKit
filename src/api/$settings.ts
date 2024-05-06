/**
 * Access broadcaster provided app settings with this method.
 * All settings that you create for your app become available as properties of the $settings object.
 */
type Settings = Record<string, any>;

export declare const $settings: Settings;
