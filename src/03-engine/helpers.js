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
     * @throws Error, если не найден.
     */
    function getBot(name) {
        var bot = global.TGActionsSettings.bots[name];
        if (name === null) {
            bot = global.TGActionsSettings.bots._default;
            return bot;
        }
        if (!bot) {
            _logger.error('getBot: Bot {} not found', name);
            throw new Error('Bot "' + name + '" not found');
        }
        return bot;
    }

    /** Возвращает chat_id по алиасу или числу. */
    function getChat(name) {
        var chatObj;
        if (name === null) {
            chatObj = global.TGActionsSettings.chats._default;
            return chatObj;
        }
        if (global.TGActionsSettings.chats.hasOwnProperty(name)) {
            chatObj = global.TGActionsSettings.chats[name]
            return chatObj;
        }
        if (/^-?\d+$/.test(String(name))) {
            return String(name);
        }
        _logger.error('getChat: Chat {} not found', name);
        throw new Error('Chat "' + name + '" not found');
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
