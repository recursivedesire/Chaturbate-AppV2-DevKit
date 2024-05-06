import {$app} from "./api/$app";
import {$kv} from "./api/$kv";
import {$limitcam} from "./api/$limitcam";
import {$room} from "./api/$room";
import {$user} from "./api/$user";
import {$settings} from "./api/$settings";
import {} from "./sharedCode";

/**
 * Set or update the information displayed in the user's broadcast panel (270 x 69 pixels).
 * The broadcast panel is the rectangular panel that appears below the chat in split mode and on the broadcaster page. In theater mode, the broadcast panel appears within the chat window.
 * $kv updates in the Broadcast Panel Update event handler may not have any effect due to caching.
 * Accessing the $user SDK object in the Broadcast Panel Update event handler may cause panel context rendering delays in larger rooms.
 */
