/**
 * Версия модуля и константы обращения к Telegram Bot API.
 * Зависимостей нет.
 */
function TGActionsConstants() {
    var CONSTANTS = {
        API_URL_BASE: 'https://api.telegram.org',
        PARSE_MODE: 'Markdown',
        DEFAULT_POLL_TIMEOUT: 9,     // seconds for long‑polling
        GET_UPDATES_ENDPOINT: '/getUpdates',
        SET_DESCRIPTION_ENDPOINT: '/setMyDescription',
        SET_SHORT_DESCRIPTION_ENDPOINT: '/setMyShortDescription',
        RETRY_DELAY_ON_503_MS: 10000,
        RETRY_DELAY_ON_409_MS: 10000,
        POLL_LOOP_DELAY_MS: 100       // delay between polls when nothing happens
    };

    return {
        ver: "#0.5.2#03.07.25",
        CONSTANTS: CONSTANTS
    };
}
