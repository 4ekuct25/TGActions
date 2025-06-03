var TGActions = (function() {
    // Логгер для модуля - выводит информацию и ошибки
    var _logger = global.LoggerFactory.create('TGActions');

    /**
     * Константы для HTTP-запросов Telegram API
     * API_URL_BASE — домен для запросов
     * PARSE_MODE — поддержка Markdown
     * GET_UPDATES_ENDPOINT — путь для getUpdates
     */
    var CONSTANTS = {
        API_URL_BASE: 'https://api.telegram.org',
        PARSE_MODE: 'Markdown',
        DEFAULT_POLL_TIMEOUT: 30, 
        GET_UPDATES_ENDPOINT: '/getUpdates',
         RETRY_DELAY_ON_503_MS: 5000,                      // Delay on HTTP 503 (ms)
           RETRY_DELAY_ON_409_MS: 10000   
    };

    /**
     * Конфигурация ботов:
     * key — токен
     * updateInterval — частота опроса (ms)
     * historySize — максимальный размер истории
     */
    var bots = {
        'botName1': {key: 'myname',        // замените на реальный токен
                 // опрос каждые 5 секунд
            historySize: 50},
        'botName2': { key: 'YOUR_BOT_TOKEN_2', updateInterval: 10000 }
    };

    /**
     * Словарь именованных чатов:
     * chatName — удобочитаемое имя, value — chat_id
     */
    var chats = { 
        'chatName1': '399310593',
        'chatName2': 'CHAT_ID_2'
    };

       /**
     * Predefined button sets (inline_keyboard):
     * 1D arrays for single row, 2D arrays for multiple rows.
     * Button object: { text, handler, response }
     */
    var buttonSets = {
        bot1YesNo: [
           [ { text: 'Ванная', handler: function() { _logger.info('Ванная'); }, response: 'Вы нажали Ванная' },
            { text: 'Кухня', handler: function() { _logger.info('Кухня'); }, response: 'Вы нажали Кухня' }],
            [{ text: 'Коридор', handler: function() { _logger.info('Коридор'); }, response: 'Вы нажали Коридор' }]
        ],
        multiExample: [
            [ { text: 'A', handler: function() { _logger.info('A'); }, response: 'Pressed A' },
              { text: 'B', handler: function() { _logger.info('B'); }, response: 'Pressed B' } ],
            [ { text: 'C', handler: function() { _logger.info('C'); }, response: 'Pressed C' } ]
        ]
    };
 
   // Polling state per bot
    var pollOffsets = {}, pollingActive = {};

    /** Retrieve bot config by name */
    function getBot(name) {
        var bot = bots[name];
        if (!bot) {
            _logger.error('getBot: Bot {} not found', name);
            throw new Error('Bot "' + name + '" not found');
        }
        return bot;
    }

    /** Retrieve chat_id by logical name */
    function getChat(name) {
        var id = chats[name];
        if (!id) {
            _logger.error('getChat: Chat {} not found', name);
            throw new Error('Chat "' + name + '" not found');
        }
        return id;
    }

    /** Internal sendMessage via HTTP POST */
    function sendMessageInternal(botName, chatName, textLines, inlineKeyboard, notify) {
        var bot = getBot(botName), chatId = getChat(chatName);
        var url = CONSTANTS.API_URL_BASE + '/bot' + bot.key + '/sendMessage';
        var params = {
            chat_id: chatId,
            text: textLines.join('\n'),
            parse_mode: CONSTANTS.PARSE_MODE,
            disable_notification: notify == null ? false : !notify
        };
        if (inlineKeyboard) params.reply_markup = JSON.stringify({ inline_keyboard: inlineKeyboard });

        _logger.info('Request URL: {}', url);
        _logger.info('Request params: {}', JSON.stringify(params));
        try {
            var req = HttpClient.POST(url);
            Object.keys(params).forEach(function(k) { req = req.queryString(k, params[k]); });
            var resp = req.send();
            _logger.info('Response status: {}', resp.getStatus());
            _logger.info('Response body: {}', resp.getBody());
            if (resp.getStatus() !== 200) _logger.error('sendMessageInternal failed status {}', resp.getStatus());
        } catch (e) {
            _logger.error('sendMessageInternal exception: {}', e);
        }
    }

    /** Send a simple text message */
    function sendSimpleMessage(botName, chatName, text, notify) {
        var lines = Array.isArray(text) ? text : [text];
        sendMessageInternal(botName, chatName, lines, null, notify);
    }

    /** Send interactive message by button set name */
    function sendInteractiveMessage(botName, chatName, setName, text, notify) {
        var set = buttonSets[setName];
        if (!set) {
            _logger.error('sendInteractiveMessage: set {} not found', setName);
            return;
        }
        var rows = Array.isArray(set[0]) ? set : [set];
        var keyboard = rows.map(function(row, r) {
            return row.map(function(btn, c) {
                var cb = [setName, r, c, chatName].join(':');
                return { text: btn.text, callback_data: cb };
            });
        });
        var lines = Array.isArray(text) ? text : [text];
        sendMessageInternal(botName, chatName, lines, keyboard, notify);
    }

    /** Handle callback_query: dispatch and send response */
    function handleCallbackQuery(botName, cq) {
        var parts = cq.data.split(':'), setName = parts[0], r = +parts[1], c = +parts[2], chatName = parts[3];
        var set = buttonSets[setName];
        if (set) {
            var row = Array.isArray(set[0]) ? set[r] : set;
            var btn = row[c];
            if (btn && btn.handler) {
                try {
                    _logger.info('handleCallbackQuery invoking {}', cq.data);
                    btn.handler(cq);
                    if (btn.response) sendSimpleMessage(botName, chatName, btn.response);
                } catch (e) {
                    _logger.error('handleCallbackQuery handler error: {}', e);
                }
            }
        } else {
            _logger.warn('handleCallbackQuery: set {} not found', setName);
        }
        try {
            HttpClient.POST(CONSTANTS.API_URL_BASE)
                .path('bot' + getBot(botName).key)
                .path('answerCallbackQuery')
                .queryString('callback_query_id', cq.id)
                .send();
            _logger.info('handleCallbackQuery answered {}', cq.id);
        } catch (e) {
            _logger.error('handleCallbackQuery answer error: {}', e);
        }
    }

    /**
     * Long polling loop getUpdates implementation
     * Includes retry delays for HTTP 503 and 409
     */
    function pollUpdates(botName) {
        var bot = getBot(botName);
        pollOffsets[botName] = pollOffsets[botName] || 0;
        pollingActive[botName] = true;
        _logger.info('Starting long polling for {} with timeout {}s', botName,
            bot.pollTimeout || CONSTANTS.DEFAULT_POLL_TIMEOUT);

        while (pollingActive[botName]) {
            try {
                // Log current offset before request
                _logger.info('pollUpdates sending request with offset {}', pollOffsets[botName]);
                var timeoutVal = bot.pollTimeout || CONSTANTS.DEFAULT_POLL_TIMEOUT;
                var res = HttpClient.POST(CONSTANTS.API_URL_BASE)
                    .path('bot' + bot.key)
                    .path(CONSTANTS.GET_UPDATES_ENDPOINT)
                    .queryString('offset', pollOffsets[botName])
                    .queryString('timeout', timeoutVal)
                    .send();
                var status = res.getStatus();
                _logger.info('pollUpdates response status {}', status);
                if (status === 200) {
                    var data = JSON.parse(res.getBody());
                    if (Array.isArray(data.result) && data.result.length) {
                        data.result.forEach(function(update) {
                            if (update.callback_query) {};//handleCallbackQuery(botName, update.callback_query);
                        });
                        var lastId = data.result[data.result.length - 1].update_id;
                        pollOffsets[botName] = lastId + 1;
                        _logger.info('pollUpdates updated offset to {}', pollOffsets[botName]);
                    }
                } else if (status === 503) {
                    _logger.warn('Received 503, delaying {} ms', CONSTANTS.RETRY_DELAY_ON_503_MS);
                    var until = new Date().getTime() + CONSTANTS.RETRY_DELAY_ON_503_MS;
                    while (new Date().getTime() < until) {}
                } else if (status === 409) {
                    _logger.warn('Received 409 Conflict, resetting offset to 0 and delaying {} ms', CONSTANTS.RETRY_DELAY_ON_409_MS);
                    pollOffsets[botName] = 0;
                    var until2 = new Date().getTime() + CONSTANTS.RETRY_DELAY_ON_409_MS;
                    while (new Date().getTime() < until2) {}
                } else {
                    _logger.error('pollUpdates error status {}', status);
                }
            } catch (e) {
                _logger.error('pollUpdates exception: {}', e);
            }
        }
        _logger.info('Long polling stopped for {}', botName);
    }

    /** Stop long polling */
    function stopPolling(botName) {
        pollingActive[botName] = false;
        _logger.info('stopPolling: stopped polling for {}', botName);
    }

    return {
        sendSimpleMessage: sendSimpleMessage,
        sendInteractiveMessage: sendInteractiveMessage,
        handleCallbackQuery: handleCallbackQuery,
        pollUpdates: pollUpdates,
        stopPolling: stopPolling,
        buttonSets: buttonSets
    };
})();


// Пример вызова sendInteractiveMessage:
// TGActions.sendInteractiveMessage(
//     'botName1',
//     'chatName1',
//     'bot1YesNo',
//     'Пожалуйста, выберите опцию:',
//     true
// );
