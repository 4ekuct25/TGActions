TGActionsSettings = (function () {
    // ───────────────────────────── Logger ─────────────────────────────
    var _logger = global.LoggerFactory.create('TGActionsSettings');


    // ──────────────────────── Описание бота по умолчанию ────────────────────
    // Подставляется движком в setBotMeta, если у бота в bots не заданы
    // description / shortDescription. Отдаётся наружу как
    // botDescription / botShortDescription — движок читает их оттуда,
    // свободных глобальных переменных нет.
    // Лимиты Telegram: description ≤ 512 символов, short_description ≤ 120.
    var BOT_DESCRIPTION = 'Бот автоматизации умного дома на базе Sprut.hub';
    var BOT_SHORT_DESCRIPTION = 'Умный дом';

    // ───────────────────────────── Bots config ─────────────────────────────
    var bots = {
        _default: 'botName1',
        botName1: {
            key: 'Заполнить',
            description: 'Бот автоматизации умного дома',
            shortDescription: 'Умный дом',
            autoStart:true
        },
        botName2: {
            key: 'Заполнить',
            description: "second bot",
            shortDescription: "second bot",
        }
    };

    // ───────────────────────────── Named chats ─────────────────────────────
    var chats = {
        _default: 'chatName1',
        chatName1: 'Заполнить',
        chatName2: 'Заполнить'
    };

    // ──────────────────────────── Reply‑клавиатуры ────────────────────────────
var replyKeyboardSets = {
    mainMenu: {
        rows: [
            ['🍔🍿 МИНИ‑ФЕСТ 🤪📊🎁'],
            ['⚡ Акции и новинки'],
            ['📌 Найти ближайшее предприятие']
        ],
        oneTime: true   // ← keyboard will hide after first click
    },
    yesNo: [
        ['Yes'],
        ['No'],
        ['Тест']
    ]
};

    // ───────────────────────────── Button sets ─────────────────────────────
var buttonSets = {
    // ─────────────────────── Inline‑кнопки (callback_query) ───────────────────────
    // Кнопка показывает кнопки выбора сервиса
    getServ: [
        [
            //Показывает с термостата Hub.getAccessory(123).getCharacteristic(15).getValue(); и предлагает установить новую температуру на термостате
            {
                text: 'Температура',
                /**
                 * @param {Object} cq – объект callback_query из Telegram
                 */
                handler: function (ctx) {
                    _logger.info('getTemp → Температура');

                    // chatId того чата, где нажали кнопку
                    var chatIdStr = String(ctx.message.chat.id);

                    // Показываем температуру
                    //!!! исправьте на свои параметры
                    var temp = Hub.getAccessory(123)
                        .getCharacteristic(15)
                        .getValue();
                    global.TGActions.sendSimpleMessage(
                        'botName1',
                        chatIdStr,
                        'Текущая температура: ' + temp
                    );

                    // Предлагаем выбрать новую температуру
                    global.TGActions.sendInteractiveMessage(
                        'botName1',
                        chatIdStr,
                        'tempExample',
                        'Выбирайте температуру',
                        true
                    );
                },
                response: '' // ответ формируем вручную выше
            },
            //Кнопка обрабатывает нажатие Обслуживание в номере
            {
                text: 'Обслуживание в номере',
                handler: function (ctx) {
                    _logger.info('getTemp → Обслуживание');
                    global.TGActions.sendSimpleMessage(
                        'botName1',
                        String(ctx.message.chat.id),
                        'Вы нажали Обслуживание'
                    );
                },
                response: ''
            }
        ],
        [
            //Кнопка служит примером как создать многострочные наборы кнопок
            {
                text: 'Кнопка на новой строке',
                handler: function (ctx) {
                    _logger.info('getTemp → Кнопка на новой строке');
                    global.TGActions.sendSimpleMessage(
                        'botName1',
                        String(ctx.message.chat.id),
                        'Вы нажали Кнопка на новой строке'
                    );
                },
                response: ''
            }
        ]
    ],
    //Кнопки устанавливают температуру на термостате
    tempExample: [
        [
            {
                text: '16',
                handler: function (ctx) {
                    _logger.info('tempExample → 16');
                    Hub.getAccessory(123).getCharacteristic(15).setValue(16); //!!! исправьте на свои параметры
                    global.TGActions.sendSimpleMessage(
                        'botName1',
                        String(ctx.message.chat.id),
                        'Ставим 16 °C'

                    );
                },
                response: ''
            },
            {
                text: '18',
                handler: function (ctx) {
                    _logger.info('tempExample → 18');
                    Hub.getAccessory(123).getCharacteristic(15).setValue(18); //!!! исправьте на свои параметры
                    global.TGActions.sendSimpleMessage(
                        'botName1',
                        String(ctx.message.chat.id),
                        'Ставим 18 °C'
                    );
                },
                response: ''
            }
        ],
        [
            {
                text: '25',
                handler: function (ctx) {
                    _logger.info('tempExample → 25');
                    Hub.getAccessory(123).getCharacteristic(15).setValue(25);  //!!! исправьте на свои параметры
                    global.TGActions.sendSimpleMessage(
                        'botName1',
                        String(ctx.message.chat.id),
                        'Ставим 25 °C'
                    );
                },
                response: ''
            }
        ]
    ],
    //Пример кнопок вызываемых командой бота
    quickScenarios: [
        [
            {
                text: 'Возвращаюсь домой',
                handler: function (ctx) {
                    _logger.info('Scenario – coming home');
                },
                response: 'Сценарий «Возвращаюсь домой» запущен'
            },
            {
                text: 'Ушел из дома',
                handler: function (ctx) {
                    _logger.info('Scenario – away');
                },
                response: 'Сценарий «Ушел из дома» запущен'
            }
        ]
    ],

    // ─────────────────────────── Reply‑кнопки (replyKeyboard) ───────────────────────────
    //Пример обработки Reply кнопок 
    mainMenu: [
        [
            {
                text: '🍔🍿 МИНИ‑ФЕСТ 🤪📊🎁',
                /**
                 * @param {Object} ctx – объект {botName, chatId, messageText}
                 */
                handler: function (ctx) {
                    _logger.info('mainMenu → Mini‑Fest');

                    // Убираем клавиатуру и отвечаем в том же чате
                    global.TGActions.removeReplyKeyboard(
                        ctx.botName,
                        String(ctx.chatId),
                        ''
                    );
                    global.TGActions.sendSimpleMessage(
                        ctx.botName,
                        String(ctx.chatId),
                        'Скоро мини‑фест! 🎉'
                    );
                },
                response: ''
            }
        ],
        [
            {
                text: '⚡ Акции и новинки',
                handler: function (ctx) {
                    _logger.info('mainMenu → Акции и новинки');

                    global.TGActions.removeReplyKeyboard(
                        ctx.botName,
                        String(ctx.chatId),
                        ''
                    );
                    global.TGActions.sendSimpleMessage(
                        ctx.botName,
                        String(ctx.chatId),
                        'Скоро ⚡ Акции и новинки'
                    );
                },
                response: ''
            }
        ]
    ]
};

    // ───────────────────────────── Bot commands ─────────────────────────────
    var botCommands = {
        start: {
            description: 'Приветствие и краткое описание',
            handler: function (ctx) {
                var reply = BOT_DESCRIPTION + '\n\nДля списка команд введите /help';
                global.TGActions.sendSimpleMessage(ctx.botName, String(ctx.chatId), reply);
                _logger.info('Executed /start');
            }
        },
        help: {
            description: 'Список команд и их описание',
            handler: function (ctx) {
                var lines = [];
                for (var name in botCommands) {
                    if (botCommands.hasOwnProperty(name)) {
                        var desc = botCommands[name].description || '';
                        lines.push('/' + name + ' – ' + desc);
                    }
                }
                global.TGActions.sendSimpleMessage(ctx.botName, String(ctx.chatId), lines.join('\n'));
                _logger.info('Executed /help');
            }
        },
        about: {
            description: 'Информация о боте',
            handler: function (ctx) {
                global.TGActions.sendSimpleMessage(ctx.botName, String(ctx.chatId), BOT_DESCRIPTION);
                _logger.info('Executed /about');
            }
        },
        echo: {
            description: 'Повторяет переданный текст',
            handler: function (ctx) {
                var text = ctx.params.join(' ');
                global.TGActions.sendSimpleMessage(ctx.botName, String(ctx.chatId), text);
                _logger.info('Executed /echo with params: {}', ctx.params);
            }
        },
        temp: {
            description: 'Показывает введенные параметры',
            handler: function (ctx) {
                var paramsText = ctx.params.join(' ');
                var reply = 'Вы ввели параметры: ' + paramsText;
                global.TGActions.sendSimpleMessage(ctx.botName, String(ctx.chatId), reply);
                _logger.info('Executed /temp with params: {}', ctx.params);
            }
        },
        menu: {
            description: 'Быстрые сценарии',
            handler: function (ctx) {
                global.TGActions.sendInteractiveMessage(
                    ctx.botName,
                    String(ctx.chatId),
                    'quickScenarios',
                    'Выберите сценарий',
                    { notify: false }
                );
                _logger.info('Executed /menu');
            }
        },
        mainmenu: {
            description: 'Главное меню быстрых кнопок',
            handler: function (ctx) {
                global.TGActions.sendReplyKeyboard(
                    ctx.botName,
                    String(ctx.chatId),
                    'mainMenu',
                    'Вот ты и снова в Главном меню!\nЧем я могу помочь? 😌'
                );
                _logger.info('Executed /mainmenu');
            }
        }
    };

    _logger.info('TGActionsSettings initialized');

    // ───────────────────────────── Public API ─────────────────────────────
    return {
        botDescription: BOT_DESCRIPTION,
        botShortDescription: BOT_SHORT_DESCRIPTION,
        bots: bots,
        chats: chats,
        replyKeyboardSets: replyKeyboardSets,
        buttonSets: buttonSets,
        botCommands: botCommands
    };
})();
