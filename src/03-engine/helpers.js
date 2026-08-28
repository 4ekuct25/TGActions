/**
 * Разрешение имён ботов и чатов, сборка URL, работа с таймерами.
 *
 * Зависимости: logger, constants.
 */
function TGActionsHelpers(ns) {
    var _logger = ns.logger;
    var CONSTANTS = ns.constants.CONSTANTS;

    /**
     * Возвращает конфиг бота по имени.
     *
     * `bots._default` — это АЛИАС (имя бота), а не конфиг, поэтому при
     * name === null/undefined имя сначала разворачивается через него,
     * и только потом берётся конфиг.
     *
     * @throws Error, если не найден.
     */
    function getBot(name) {
        var bots = global.TGActionsSettings.bots;
        var key = (name === null || name === undefined) ? bots._default : name;
        var bot = bots[key];
        if (!bot || typeof bot !== 'object') {
            _logger.error('getBot: Bot {} not found', key);
            throw new Error('Bot "' + key + '" not found');
        }
        return bot;
    }

    /**
     * Возвращает chat_id по алиасу или числу.
     *
     * `chats._default` — тоже алиас (имя чата), а не chat_id: при
     * name === null/undefined разворачиваем его до именованного чата.
     */
    function getChat(name) {
        var chats = global.TGActionsSettings.chats;
        var key = (name === null || name === undefined) ? chats._default : name;
        if (chats.hasOwnProperty(key)) {
            return chats[key];
        }
        if (/^-?\d+$/.test(String(key))) {
            return String(key);
        }
        _logger.error('getChat: Chat {} not found', key);
        throw new Error('Chat "' + key + '" not found');
    }

    /** Собирает URL для запроса Telegram Bot API. */
    function buildApiUrl(botKey, path) {
        return CONSTANTS.API_URL_BASE + '/bot' + botKey + path;
    }

    /** Безопасно очищает таймер (если был задан). */
    function safeClearTimer(task) {
        if (task) {
            clearTimeout(task);
        }
    }

    return {
        getBot: getBot,
        getChat: getChat,
        buildApiUrl: buildApiUrl,
        safeClearTimer: safeClearTimer
    };
}
