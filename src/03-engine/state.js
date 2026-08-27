/**
 * Служебные состояния – где находимся в процессе опроса, id последнего
 * обновления и т.п. Не трогаем извне.
 *
 * Контейнеры отдаются наружу по ссылке: модули мутируют одни и те же объекты,
 * как это было внутри общей IIFE.
 *
 * Зависимостей нет (читает global.TGActionsSettings.chats при создании).
 */
function TGActionsState() {
    var pollOffsets = {};   // last processed update_id + 1 per bot
    var pollingActive = {}; // boolean flags per bot
    var pollTimers = {};    // Timer per bot
    var inFlight = {};      // true while HTTP long‑poll is not finished
    var commandsRegistered = {};
    var _activeReplyMenus = {};
    var _webhookCleared = {};
    var _error409Streak = {};

    /**
     * Множество разрешённых chat_id, собранное из объекта chats. Все входящие
     * сообщения из других чатов будут игнорироваться.
     */
    var _allowedChatIds = (function () {
        var ids = {};
        for (var k in global.TGActionsSettings.chats) {
            if (global.TGActionsSettings.chats.hasOwnProperty(k)) {
                ids[String(global.TGActionsSettings.chats[k])] = true;
            }
        }
        return ids;
    }());

    /** Проверка, разрешён ли chat_id */
    function _isAllowedChat(chatId) {
        return _allowedChatIds.hasOwnProperty(String(chatId));
    }

    return {
        pollOffsets: pollOffsets,
        pollingActive: pollingActive,
        pollTimers: pollTimers,
        inFlight: inFlight,
        commandsRegistered: commandsRegistered,
        activeReplyMenus: _activeReplyMenus,
        webhookCleared: _webhookCleared,
        error409Streak: _error409Streak,
        isAllowedChat: _isAllowedChat
    };
}
