/**
 * Обработка входящих: нажатия inline-кнопок, команды, клики по reply-кнопкам.
 *
 * Зависимости: logger, helpers, state, messaging.
 */
function TGActionsHandlers(ns) {
    var _logger = ns.logger;
    var getBot = ns.helpers.getBot;
    var buildApiUrl = ns.helpers.buildApiUrl;
    var _isAllowedChat = ns.state.isAllowedChat;
    var _activeReplyMenus = ns.state.activeReplyMenus;
    var sendSimpleMessage = ns.messaging.sendSimpleMessage;

    /**
     * Обрабатывает нажатия inline‑кнопок (callback_query).
     * Проверяет авторизацию, находит нужный handler в buttonSets и вызывает его.
     */
    function handleCallbackQuery(botName, cq) {
        if (!_isAllowedChat(cq.message.chat.id)) {
            _logger.warn('Callback from unauthorized chat {} ignored', cq.message.chat.id);
            return;
        }
        var parts = cq.data.split(':');
        var setName = parts[0];
        var r = +parts[1];
        var c = +parts[2];
        var chatName = parts[3];

        var set = global.TGActionsSettings.buttonSets[setName];
        if (set) {
            var row = Array.isArray(set[0]) ? set[r] : set;
            var btn = row[c];
            if (btn && typeof btn.handler === 'function') {
                try {
                    btn.handler(cq);
                    if (btn.response) {
                        sendSimpleMessage(botName, chatName, btn.response);
                    }
                } catch (e) {
                    _logger.error('handleCallbackQuery handler error: {}', e);
                }
            }
        } else {
            _logger.warn('handleCallbackQuery: set {} not found', setName);
        }
        try {
            HttpClient.POST(buildApiUrl(getBot(botName).key, '/answerCallbackQuery')).queryString('callback_query_id', cq.id).send();
        } catch (e) {
            _logger.error('handleCallbackQuery answer error: {}', e);
        }
    }

    /**
     * Обрабатывает входящее пользовательское сообщение (text).
     */
    function handleMessage(botName, msg) {
        if (!msg || !msg.text) {
            return;
        }
        if (!_isAllowedChat(msg.chat.id)) {
            _logger.warn('Message from unauthorized chat {} ignored', msg.chat.id);
            return;
        }
        var text = msg.text.trim();
        if (text.charAt(0) === '/') {
            var parts = text.split(' ');
            var cmdName = parts[0].substring(1).toLowerCase();
            var params = parts.slice(1);
            var cmd = global.TGActionsSettings.botCommands[cmdName];
            if (!cmd || typeof cmd.handler !== 'function') {
                _logger.warn('Unknown command {}', cmdName);
                return;
            }
            try {
                cmd.handler({ botName: botName, chatId: msg.chat.id, params: params, message: msg });
            } catch (e) {
                _logger.error('handleMessage error: {}', e);
            }
            return;
        }
        if (handleReplyButton(botName, msg.chat.id, text)) {
            return;
        }
    }

    /**
     * Обрабатывает клики по reply‑кнопкам (текстовые сообщения).
     */
    function handleReplyButton(botName, chatId, text) {
        var setName = _activeReplyMenus[String(chatId)];
        if (!setName) {
            return false;
        }
        var set = global.TGActionsSettings.buttonSets[setName];
        if (!set) {
            return false;
        }
        var rows = Array.isArray(set[0]) ? set : [set];
        for (var r = 0; r < rows.length; r++) {
            var row = rows[r];
            for (var c = 0; c < row.length; c++) {
                var btn = row[c];
                if (btn && btn.text === text) {
                    if (typeof btn.handler === 'function') {
                        try {
                            btn.handler({ botName: botName, chatId: chatId, messageText: text });
                        } catch (e) {
                            _logger.error('handleReplyButton handler error: {}', e);
                        }
                    }
                    if (btn && btn.response) {
                        sendSimpleMessage(botName, String(chatId), btn.response);
                    }
                    return true;
                }
            }
        }
        return false;
    }

    return {
        handleCallbackQuery: handleCallbackQuery,
        handleMessage: handleMessage,
        handleReplyButton: handleReplyButton
    };
}
