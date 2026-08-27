/**
 * Отправка и удаление сообщений, reply- и inline-клавиатуры.
 *
 * Зависимости: logger, constants, helpers, state.
 */
function TGActionsMessaging(ns) {
    var _logger = ns.logger;
    var CONSTANTS = ns.constants.CONSTANTS;
    var getBot = ns.helpers.getBot;
    var getChat = ns.helpers.getChat;
    var buildApiUrl = ns.helpers.buildApiUrl;
    var _activeReplyMenus = ns.state.activeReplyMenus;

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


        _logger.info("1 botName:{};chat:{}", botName, chatName);
        opts = opts || {};
        var notify = opts.hasOwnProperty('notify') ? !!opts.notify : true;
        var autoDeleteAfterSec = opts.autoDeleteAfterSec || 0;
        var topicId = opts.topicId;
        var replyMarkup = opts.replyMarkup;

        var bot = getBot(botName);
        var chatId = getChat(chatName);
        _logger.info("2 bot:{};chat:{}", bot, chatId);

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
     * Поддерживает два формата описания меню в replyKeyboardSets:
     * массив строк (старый) и объект { rows, oneTime } (новый).
     *
     * @example
     * TGActions.sendReplyKeyboard('botName1', 'chatName1', 'mainMenu',
     *     'Чем могу помочь?');
     */
    function sendReplyKeyboard(botName, chatName, setName, text, opts) {
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

    return {
        sendMessageInternal: sendMessageInternal,
        sendSimpleMessage: sendSimpleMessage,
        sendInteractiveMessage: sendInteractiveMessage,
        sendReplyKeyboard: sendReplyKeyboard,
        removeReplyKeyboard: removeReplyKeyboard,
        registerReplyKeyboardSet: registerReplyKeyboardSet,
        scheduleDeletion: scheduleDeletion,
        deleteMessageInternal: deleteMessageInternal
    };
}
