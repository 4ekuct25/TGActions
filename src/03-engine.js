/*
 Прочитайте README.MD
 В данном модуле не нужно ничего менять
 
 */

var TGActions = (function () {
    // ────────────────────────────────  Logger  ────────────────────────────────
    /** @private */
    var ver = "#0.5.2#03.07.25"
    var _logger;

    // ───────────────────────────────  Constants  ──────────────────────────────
    /**
     * Константы, используемые при обращении к Telegram Bot API.
     * @enum
     */
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

   
    // ───────────────────────────  Internal state containers  ──────────────────
    /**
     * Служебные состояния – где находимся в процессе опроса, id последнего
     * обновления и т.п. Не трогаем извне.
     */
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

    // ──────────────────────────────  Helper functions  ────────────────────────

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
            chatObj=global.TGActionsSettings.chats[name]
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

    // ────────────────────────────────  Messaging API  ─────────────────────────

    /**
     * Базовая функция отправки сообщения (служебная).
     * Все публичные send* используют её внутри.
     * 
     * Если **botName или chatName**
     * равны null, то вместо них будет использовано bots._default или
     * chats._default соответственно.
     *
     */
  function sendMessageInternal(botName, chatName, textLines, inlineKeyboard, opts) {
        if (typeof opts === 'boolean') {
            opts = { notify: opts };
        }


        _logger.info("1 botName:{};chat:{}",botName,chatName);
        opts = opts || {};
        var notify = opts.hasOwnProperty('notify') ? !!opts.notify : true;
        var autoDeleteAfterSec = opts.autoDeleteAfterSec || 0;
        var topicId = opts.topicId;
        var replyMarkup = opts.replyMarkup;

        var bot = getBot(botName);
        var chatId = getChat(chatName);
        _logger.info("2 bot:{};chat:{}",bot,chatId);

        var url = buildApiUrl(bot.key, '/sendMessage');

        var params = {
            chat_id: chatId,
            text: Array.isArray(textLines) ? textLines.join('\n') : String(textLines),
            parse_mode: CONSTANTS.PARSE_MODE,
            disable_notification: !notify
        };
        if (replyMarkup) {
            params.reply_markup = JSON.stringify(replyMarkup);
        } else if (inlineKeyboard) {
            params.reply_markup = JSON.stringify({ inline_keyboard: inlineKeyboard });
        }
        if (typeof topicId === 'number') {
            params.message_thread_id = topicId;
        }

        try {
            var req = HttpClient.POST(url);
            for (var k in params) {
                if (params.hasOwnProperty(k)) {
                    req = req.queryString(k, params[k]);
                }
            }
            var resp = req.send();
            if (resp.getStatus() !== 200) {
                _logger.error('sendMessageInternal failed status {}', resp.getStatus());
                return;
            }
            if (autoDeleteAfterSec > 0) {
                var body;
                try {
                    body = JSON.parse(resp.getBody());
                } catch (eJson) {
                    _logger.error('sendMessageInternal JSON parse error: {}', eJson);
                    return;
                }
                if (body && body.ok) {
                    scheduleDeletion(botName, chatId, body.result.message_id, autoDeleteAfterSec * 1000);
                }
            }
        } catch (e) {
            _logger.error('sendMessageInternal exception: {}', e);
        }
    }

    /**
     * Отправляет простое текстовое сообщение (без кнопок).
     *
     * @example
     * // Простой случай – стандартное уведомление
     * TGActions.sendSimpleMessage('botName1', 'chatName1', 'Привет!');
     *
     * @example
     * // Без push‑уведомления и авто‑удалить через 30 с
     * TGActions.sendSimpleMessage('botName1', 'chatName1',
     *     'Секретное сообщение', { notify: false, autoDeleteAfterSec: 30 });
     */
    function sendSimpleMessage(botName, chatName, text, notify) {
        sendMessageInternal(botName, chatName, Array.isArray(text) ? text : [text], null, notify);
    }

    /**
     * Отправляет сообщение с inline‑кнопками (callback_query).
     *
     * @param {String} botName
     * @param {String|Number} chatName
     * @param {String} setName Название набора в buttonSets
     * @param {String|String[]} text
     * @param {Boolean|Object} [notify]
     *
     * @example
     * TGActions.sendInteractiveMessage('botName1', 'chatName1', 'bot1YesNo',
     *     'Выберите вариант');
     */
    function sendInteractiveMessage(botName, chatName, setName, text, notify) {
        var set = global.TGActionsSettings.buttonSets[setName];
        if (!set) {
            _logger.error('sendInteractiveMessage: set {} not found', setName);
            return;
        }
        var rows = Array.isArray(set[0]) ? set : [set];
        var keyboard = rows.map(function (row, r) {
            return row.map(function (btn, c) {
                return { text: btn.text, callback_data: [setName, r, c, chatName].join(':') };
            });
        });
        sendMessageInternal(botName, chatName, Array.isArray(text) ? text : [text], keyboard, notify);
    }

 
    /**
     * Показывает/обновляет reply‑клавиатуру (обычные кнопки над полем ввода).
     *
     * @example
     * TGActions.sendReplyKeyboard('botName1', 'chatName1', 'mainMenu',
     *     'Чем могу помочь?');
     */
    function sendReplyKeyboard(botName, chatName, setName, text, opts) {
        var rows = global.TGActionsSettings.replyKeyboardSets[setName];
        if (!rows) {
            _logger.error('sendReplyKeyboard: set {} not found', setName);
            return;
        }
        var markup = { keyboard: rows, resize_keyboard: true };
        opts = opts || {};
        opts.replyMarkup = markup;
        var chatIdResolved = getChat(chatName);
        _activeReplyMenus[String(chatIdResolved)] = setName;
        sendMessageInternal(botName, chatName, Array.isArray(text) ? text : [text], null, opts);
    }function sendReplyKeyboard(botName, chatName, setName, text, opts) {
    var rk = global.TGActionsSettings.replyKeyboardSets[setName];
    if (!rk) {
        _logger.error('sendReplyKeyboard: set {} not found', setName);
        return;
    }

    var rows;
    var oneTime = false;
    // Поддержка двух вариантов описания меню
    if (Array.isArray(rk)) {
        rows = rk;                   // старый формат – просто массив строк
    } else {
        rows = rk.rows;              // новый формат – объект
        oneTime = !!rk.oneTime;
    }

    var markup = { keyboard: rows, resize_keyboard: true };
    if (oneTime) {
        markup.one_time_keyboard = true;
    }

    opts = opts || {};
    opts.replyMarkup = markup;

    var chatIdResolved = getChat(chatName);
    _activeReplyMenus[String(chatIdResolved)] = setName;
    sendMessageInternal(botName, chatName, Array.isArray(text) ? text : [text], null, opts);
}


    /** Снимает reply‑клавиатуру. */
        function removeReplyKeyboard(botName, chatName, text, opts) {
            var markup = { remove_keyboard: true };
            opts = opts || {};
            opts.replyMarkup = markup;
            sendMessageInternal(botName, chatName, Array.isArray(text) ? text : [text], null, opts);
            // Очищаем трекер активного меню для чата
            try {
                var chatIdResolved = getChat(chatName);
                delete _activeReplyMenus[String(chatIdResolved)];
            } catch (e) {
                // ignore bad chat
            }
        }

    /** Планирует удаление сообщения спустя delayMs миллисекунд. */
    function scheduleDeletion(botName, chatId, messageId, delayMs) {
        setTimeout(function () {
            deleteMessageInternal(botName, chatId, messageId);
        }, delayMs);
    }

    /** Регистрирует новый набор reply‑кнопок «на лету». */
    function registerReplyKeyboardSet(setName, rows) {
        if (!rows || !Array.isArray(rows)) {
            _logger.error('registerReplyKeyboardSet: rows must be an array');
            return;
        }
        global.TGActionsSettings.replyKeyboardSets[setName] = rows;
        _logger.info('Reply‑menu "{}" registered', setName);
    }

    /** Удаление сообщения (служебная). */
    function deleteMessageInternal(botName, chatId, messageId) {
        try {
            var bot = getBot(botName);
            var url = buildApiUrl(bot.key, '/deleteMessage');
            var resp = HttpClient.POST(url).queryString('chat_id', chatId).queryString('message_id', messageId).send();
            if (resp.getStatus() !== 200) {
                _logger.warn('deleteMessageInternal status {}', resp.getStatus());
            }
        } catch (e) {
            _logger.error('deleteMessageInternal exception: {}', e);
        }
    }

    // ─────────────────────────────  Callback Queries  ────────────────────────
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

    // ───────────────────────  Telegram Bot meta update  ───────────────────────
    /**
     * Устанавливает описание и короткое описание бота в Telegram.
     * Вызывается автоматически при первой регистрации команд.
     */
        function setBotMeta(botName) {
        var bot = getBot(botName);
        var description = bot.description || BOT_DESCRIPTION;
        var shortDescription = bot.shortDescription || BOT_SHORT_DESCRIPTION;
        try {
            var urlD = buildApiUrl(bot.key, CONSTANTS.SET_DESCRIPTION_ENDPOINT);
            var respD = HttpClient.POST(urlD).queryString('description', description).send();
            if (respD.getStatus() === 200) {
                _logger.info('Description set for {}', botName);
            } else {
                _logger.error('setBotMeta description {} – status {}', botName, respD.getStatus());
            }
        } catch (e) {
            _logger.error('setBotMeta description exception: {}', e);
        }
        try {
            var urlSD = buildApiUrl(bot.key, CONSTANTS.SET_SHORT_DESCRIPTION_ENDPOINT);
            var respSD = HttpClient.POST(urlSD).queryString('short_description', shortDescription).send();
            if (respSD.getStatus() === 200) {
                _logger.info('Short description set for {}', botName);
            } else {
                _logger.error('setBotMeta short description {} – status {}', botName, respSD.getStatus());
            }
        } catch (e) {
            _logger.error('setBotMeta short description exception: {}', e);
        }
    }

    // ───────────  Bot Commands registration & polling activation helpers  ──────

    /**
     * Регистрирует все команды (botCommands) в Telegram и устанавливает метаданные.
     */
    function registerBotCommands(botName) {
        if (commandsRegistered[botName]) {
            return;
        }
        var bot = getBot(botName);
        var url = buildApiUrl(bot.key, '/setMyCommands');
        var cmdArray = Object.keys(global.TGActionsSettings.botCommands).map(function (name) {
            return { command: name, description: global.TGActionsSettings.botCommands[name].description || '' };
        });
        try {
            var resp = HttpClient.POST(url).header('Content-Type', 'application/json').body(JSON.stringify({ commands: cmdArray })).send();
            if (resp.getStatus() === 200) {
                commandsRegistered[botName] = true;
                _logger.info('Registered {} commands for {}', cmdArray.length, botName);
                setBotMeta(botName);
            } else {
                _logger.error('registerBotCommands {} – status {}', botName, resp.getStatus());
            }
        } catch (e) {
            _logger.error('registerBotCommands exception: {}', e);
        }
    }


    // ─────────────────────────────  Message handling  ────────────────────────
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


    // ───────────────────────────────  Updates processing  ─────────────────────
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

    // ─────────────────────────────  Polling lifecycle  ────────────────────────

    /**
     * Запускает long‑polling. Вызывайте в начале работы скрипта.
     *
     * @example
     * TGActions.startPolling('botName1');
     */
    function startPolling(botName) {
    // Полный сброс служебных флагов перед каждым новым запуском
    _webhookCleared[botName] = false;
    _error409Streak[botName] = 0;

    if (pollingActive[botName]) {
        _logger.warn('startPolling: {} already active', botName);
        return;
    }
    registerBotCommands(botName);
    pollingActive[botName] = true;
    inFlight[botName] = false;
    if (!pollOffsets.hasOwnProperty(botName)) {
        pollOffsets[botName] = 0;
    }
    // Стартуем чуть позже, чтобы гарантированно завершился предыдущий long‑poll
    scheduleNextPoll(botName, 10000);
}

    /** Останавливает long‑polling. */
   function stopPolling(botName) {
    // Сброс флагов, чтобы следующий запуск был «чистым»
    _webhookCleared[botName] = false;
    _error409Streak[botName] = 0;

    if (!pollingActive[botName]) {
        return;
    }
    pollingActive[botName] = false;
    safeClearTimer(pollTimers[botName]);
    pollTimers[botName] = null;
    inFlight[botName] = false;
    _logger.info('stopPolling: halted for {}', botName);
}

    // ======= PRIVATE: функции pollOnce / scheduleNextPoll и т.д. =======
    // (Без изменений, добавлены только комментарии.)

    function scheduleNextPoll(botName, delayMs) {
        if (!pollingActive[botName]) {
            return;
        }
        var now2 = new Date();

        _logger.info('scheduleNextPoll streak at {}',now2.toTimeString());
        safeClearTimer(pollTimers[botName]);

        pollTimers[botName] = setTimeout(function () {
            pollOnce(botName);
        }, delayMs);
    }

    /**
     * Выполняет один запрос getUpdates (long‑polling). Внутренняя логика
     * обработки ошибок, 503/409 и т.д. вынесена сюда.
     */
  function pollOnce(botName) {
    if (!pollingActive[botName]) {
        return;
    }
    if (inFlight[botName]) {
        _logger.warn('pollOnce {} – skipped, request still in flight', botName);
        scheduleNextPoll(botName, CONSTANTS.POLL_LOOP_DELAY_MS);
        return;
    }
    inFlight[botName] = true;

    var bot = getBot(botName);
    var offset = pollOffsets[botName] || 0;
    var timeoutS = bot.pollTimeout || CONSTANTS.DEFAULT_POLL_TIMEOUT;
    var url = buildApiUrl(bot.key, CONSTANTS.GET_UPDATES_ENDPOINT) +
        '?offset=' + offset +
        '&timeout=' + timeoutS;

    var userDelay = bot.updateInterval || 0;

    function finalize(delay) {
        inFlight[botName] = false;
        scheduleNextPoll(botName, delay);
    }

    try {
          
        var now = new Date();

        _logger.info('pollOnce at {}',now.toTimeString());
        var resp = HttpClient.GET(url).send();
        var status = resp.getStatus();

        if (status === 200) {
            _error409Streak[botName] = 0;    // ← streak reset
            if (pollingActive[botName] && resp.getBody()) {
                var data;
                try {
                    data = JSON.parse(resp.getBody());
                } catch (eJson) {
                    _logger.error('pollOnce JSON parse error: {}', eJson);
                }
                if (data && Array.isArray(data.result)) {
                    processUpdates(botName, data.result);
                }
            }
            finalize(userDelay);
            return;
        }

        if (status === 503) {
            _error409Streak[botName] = 0;    // ← streak reset
            _logger.warn('pollOnce {} – HTTP 503', botName);
            finalize(CONSTANTS.RETRY_DELAY_ON_503_MS);
            return;
        }

        if (status === 409) {
            // Первая встреча 409 – пробуем снять webhook
            if (!_webhookCleared[botName]) {
                _logger.warn('pollOnce {} – HTTP 409, deleting webhook', botName);
                try {
                    HttpClient.POST(buildApiUrl(bot.key, '/deleteWebhook'))
                        .queryString('drop_pending_updates', 'true')
                        .send();
                    _webhookCleared[botName] = true;
                } catch (eWh) {
                    _logger.error('deleteWebhook error for {}: {}', botName, eWh);
                }
                _error409Streak[botName] = 1;
                finalize(CONSTANTS.RETRY_DELAY_ON_409_MS);
                return;
            }

            // Повторный 409 – наращиваем задержку (max 60 s)
            _error409Streak[botName] = (_error409Streak[botName] || 1) + 1;
            var backoff = CONSTANTS.RETRY_DELAY_ON_409_MS * _error409Streak[botName];
            if (backoff > 60000) {
                backoff = 60000;
            }
            var now2 = new Date();

            _logger.info('409streak  at {}',now2.toTimeString());
            _logger.warn('pollOnce {} – repeated 409 (streak {}), back‑off {} ms',
                botName, _error409Streak[botName], backoff);
            pollOffsets[botName] = 0; // на всякий случай сбрасываем offset
            finalize(backoff);
            return;
        }

        // Любой другой статус
        _logger.error('pollOnce {} – unexpected status {}', botName, status);
        finalize(CONSTANTS.RETRY_DELAY_ON_503_MS);
    } catch (e) {
        _logger.error('pollOnce exception for {}: {}', botName, e);
        finalize(CONSTANTS.RETRY_DELAY_ON_503_MS);
    }
}

function rebootPolling(botName) {
    var bot = getBot(botName);
    var pollTimeout = bot.pollTimeout || CONSTANTS.DEFAULT_POLL_TIMEOUT;
    var delayMs = (pollTimeout*2 + 1) * 1000;

    _logger.info('rebootBot: restarting {} after {} ms', botName, delayMs);

    stopPolling(botName);

    setTimeout(function () {
        startPolling(botName);
    }, delayMs);
}

function init() {
    // Создаем логгер для TGActions
    _logger = global.LoggerFactory.create('TGActions' + ver);
   // sendSimpleMessage(null, null, "*TGActions инициализирован*\nTEST");

}
    // ─────────────────────────────────────  Public API  ───────────────────────
    init();

    return {
        sendSimpleMessage: sendSimpleMessage,
        sendInteractiveMessage: sendInteractiveMessage,
        sendReplyKeyboard: sendReplyKeyboard,                
        removeReplyKeyboard: removeReplyKeyboard,
        registerReplyKeyboardSet: registerReplyKeyboardSet,  
        startPolling: startPolling,
        stopPolling: stopPolling,
        rebootPolling:rebootPolling
    };
})();

 

/*
 * ─────────────────────────  Дополнительные примеры  ─────────────────────────
 *
 * // Отправить сообщение и удалить его через 10 секунд:
 * TGActions.sendSimpleMessage('botName1', 'chatName1', 'Временное сообщение', {
 *     autoDeleteAfterSec: 10
 * });
 *
 * // Зарегистрировать новую клавиатуру «yesNo» на лету:
 * TGActions.registerReplyKeyboardSet('yesNo', [ ['👍 Да', '👎 Нет'] ]);
 *
 * // Показать новую клавиатуру
 * TGActions.sendReplyKeyboard('botName1', 'chatName1', 'yesNo', 'Голосуем!');
 */
