/**
 * Разбор пачки updates и раздача их конкретным обработчикам.
 *
 * Зависимости: state, handlers.
 */
function TGActionsUpdates(ns) {
    var pollOffsets = ns.state.pollOffsets;
    var handleCallbackQuery = ns.handlers.handleCallbackQuery;
    var handleMessage = ns.handlers.handleMessage;

    /**
     * Перебирает список updates и передаёт в конкретные обработчики (messages / callback_queries).
     */
    function processUpdates(botName, updates) {
        if (!updates || !updates.length) {
            return;
        }
        var maxId = -1;
        for (var i = 0; i < updates.length; i++) {
            var upd = updates[i];
            if (upd.update_id > maxId) {
                maxId = upd.update_id;
            }
            if (upd.callback_query) {
                handleCallbackQuery(botName, upd.callback_query);
            } else if (upd.message) {
                handleMessage(botName, upd.message);
            }
        }
        if (maxId >= 0) {
            pollOffsets[botName] = maxId + 1;
        }
    }

    return {
        processUpdates: processUpdates
    };
}
