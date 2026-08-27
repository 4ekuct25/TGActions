# Документация по модулю **TGActions**

---

## 0. Что делает TGActions

`TGActions` — это вспомогательный модуль, который облегчает интеграцию Telegram-ботов в сценарии «Умного дома» для Sprut. Все функции модуля выполняются через API Telegram. 
**Предупреждение:** модуль в статусе альфа-теста. Надежность модуля не достаточна для применения для значимых задач. Библиотека функций модуля может быть изменена

Он берёт на себя:

* отправку простых сообщений, inline-кнопок и reply-клавиатур;
* регистрацию команд и описание бота в Telegram;
* long-polling (получение обновлений без веб-хуков);
* автоматику перезапуска при сетевых ошибках;
* whitelisting допустимых чатов.

---

## 1. Первичная настройка
Установить сценарии (порядок установки и исполнения сценариев важен)
**Глобальные сценарии**

* Logger
* Telegram for Sprut. Part 1. ReadMe and Settings
* Telegram for Sprut. Part 2. Engine

**Блочный сценарий**
* Telegram for Sprut. Part 3. Auto start bot

**Вручную заполнить**
Сценарий Telegram for Sprut. Part 1. ReadMe and Settings
* bots. Список ботов. См. п. 3.1. 
* chats. Список допустимых чатов. См. п. 3.2.
* replyKeyboardSets. Список replyKeyboard. См. п. 3.3.
* buttonSets. Список обработчиков кнопок. См. п. 3.4.
* botCommands. Список команд бота. См. п. 3.5.

**Запустить последовательно**
* Telegram for Sprut. Part 1. ReadMe and Settings.
* Telegram for Sprut. Part 2. Engine
* Telegram for Sprut. Part 3. Auto start bot

## 2. Быстрый старт

```js
// 1. Запускаем long-polling указав имя бота из TGActionsSettings.bots
global.TGActions.startPolling('botName1');

// 2. Шлём в разрешённый чат обычный текст
global.TGActions.sendSimpleMessage('botName1', 'chatName1', 'Привет, мир!');

// 3. Показываем главное меню (reply-клавиатура)
global.TGActions.sendReplyKeyboard('botName1', 'chatName1', 'mainMenu',
    'Выберите пункт меню:');

// 4. Отправляем интерактивное сообщение c inline-кнопками
global.TGActions.sendInteractiveMessage('botName1', 'chatName1', 'bot1YesNo',
    'Выберите действие…');

// 5. Останавливаем опрос
global.TGActions.stopPolling('botName1');

// 6. Перезапускаем опрос (неодходимо для применение изменений в логике работы бота)
global.TGActions.stopPolling('botName1');

```

> **Совет:** если у бота в конфиге стоит `autoStart: true`, long-polling можно запустить автоматически при инициализации сценария.

---

## 3. Конфигурация (глобальный сценарий **Telegram for Sprut. Part 1. ReadMe and Settings**)

### 3.1. Боты (`bots`)

```js
bots: {
    _default: 'botName1',   // используется, если botName == null
    botName1: {
        key: '123456:ABC-DEF…', // токен из @BotFather
        description: 'Бот автоматизации умного дома',
        shortDescription: 'Умный дом',
        autoStart: true         // запускать автоматически
    },
    …
}
```

* **key** — обязательный токен бота.
* **autoStart** — если `true`, `TGActions.startPolling()` вызовется при запуске хаба

### 3.2. Чаты (`chats`)

```js
chats: {
    _default: 'chatName1', // используется, если chatName == null
    chatName1: '399310593',  // chat_id (числом или строкой)
    chatName2: '-1009876543210'
}
```

Все входящие сообщения из chat\_id, **не** присутствующих в этом списке, игнорируются.

### 3.3. Reply-клавиатуры (`replyKeyboardSets`)

```js
replyKeyboardSets: {
    mainMenu: {
        rows: [
            ['🍔 Меню', '⚡ Акции'],
            ['📍 Где купить?']
        ],
        oneTime: true // скрыть клавиатуру после нажатия
    },
    yesNo: {[
        ['Yes'],
        ['No']
    ]}
}
```

Объект `{ rows, oneTime }`.
* **oneTime** — скрыть клавиатуру после нажатия

### 3.4. Inline- и reply-кнопки (`buttonSets`)

Каждый набор — это массив строк (reply) или массив массивов объектов (inline):

```js
buttonSets: {
    quickScenarios: [
        [
            { text: 'Домой',  handler: function(ctx){ … }, response: 'Запускаю!' },
            { text: 'Ушёл',  handler: function(ctx){ … }, response: 'Ок!' }
        ]
    ]
}
```

* `handler(ctx)` получит либо `callback_query`, либо `{botName, chatId, messageText}` – зависит от типа кнопки.
* `response` (необяз.) — текст, который модуль пошлёт автоматически.

### 3.5. Команды бота (`botCommands`)

```js
botCommands: {
    start: { description: 'Приветствие', handler: function(ctx){ … } },
    help:  { description: 'Справка',     handler: function(ctx){ … } },
    …
}
```

Команды регистрируются в Telegram автоматически при запуске (или перезапуске) бота.

---

## 4. Отправка сообщений

| Метод                                                       | Что делает          | Минимальный пример                                     |
| ----------------------------------------------------------- | ------------------- | ------------------------------------------------------ |
| `sendSimpleMessage(bot, chat, text [, opts])`               | Обычный текст       | `TGActions.sendSimpleMessage('bot','chat','Привет');`  |
| `sendInteractiveMessage(bot, chat, setName, text [, opts])` | Inline-кнопки       | `sendInteractiveMessage('bot','chat','yesNo','?');`    |
| `sendReplyKeyboard(bot, chat, setName, text [, opts])`      | Reply-клавиатура    | `sendReplyKeyboard('bot','chat','mainMenu','Выбор:');` |
| `removeReplyKeyboard(bot, chat, text [, opts])`             | Спрятать клавиатуру | `removeReplyKeyboard('bot','chat','👍');`              |

**Опции (`opts`)**

```js
{
    notify: false,           // не показывать push-уведомление
    autoDeleteAfterSec: 30,  // удалить сообщение через 30 с
    topicId: 123,            // для групповых топиков, отправка в выбранный топик
    replyMarkup: {...}       // свой markup вместо клавиатуры.
}
```

---

## 5. Управление циклом опроса

| Метод                    | Назначение                                             |
| ------------------------ | ------------------------------------------------------ |
| `startPolling(botName)`  | Запускает опрос бота.                                   |
| `stopPolling(botName)`   | Мягко останавливает опрос.                             |
| `rebootPolling(botName)` | Перезагружает опрос через паузу *(≈ 2×timeout + 1 с)*. |

Внутри модуль обрабатывает 503/409 ошибки Telegram, чистит webhook, увеличивает back-off и т.д., поэтому в большинстве случаев вручную вмешиваться не требуется.

---

## 6. Добавление своих кнопок и reply меню «на лету»

```js
// 1. Регистрируем новое меню
TGActions.registerReplyKeyboardSet('yesNo', [
    ['👍 Да', '👎 Нет']
]);

// 2. Показываем меню пользователю
TGActions.sendReplyKeyboard('botName1', 'chatName1', 'yesNo',
    'Голосуем!');
```

---

## 7. Расширение логики

* **Inline-кнопки**: в `handler(ctx)` приходит объект `callback_query`.
  Используйте `ctx.message.chat.id` для ответа в тот же чат.

* **Командный парсер** уже разбирает `/cmd arg1 arg2` на `ctx.params`.

* **Reply-кнопки**: в `handler(ctx)` приходит `{ botName, chatId, messageText }`.
---

## 8. Логирование и отладка

```js
_logger.info('Бот запущен, версия: {}', '1.0.0');
_logger.warn('Неизвестная команда {}', cmdName);
_logger.error('Ошибка: {}', e);
```

---

## 9. Безопасность

* Отфильтровываются и не обрабатываются **входящие** сообщения из chat\_id, не перечисленных в `TGActionsSettings.chats`.
* Не добавляйте `autoStart: true` на боевых токенах, если скрипт может перезапускаться автоматически.

---

## 10. Частые ошибки

| Симптом              | Причина                                  | Решение                                                            |
| -------------------- | ---------------------------------------- | ------------------------------------------------------------------ |
| Бот не отвечает      | не запущен polling                       | `TGActions.startPolling()` или `autoStart: true`                   |
| 409 Conflict в логах | webhook ещё включён                      | модуль удалит сам; подождите либо удалите вручную `/deleteWebhook` |
| «Bot not found»      | опечатка в `bots`                        | проверьте ключи и имя                                              |
| Кнопка «молчит»      | нет `handler` или неправильный `setName` | убедитесь, что `buttonSets[setName]` существует                    |

---
## 11. Известные ошибки и ограничеия

* Опрос от пользователя ответов происходит через long-polling длительностю до 9 секунд в цикле с ожтиданием в 0,1 секунду перед следующим запросом. Т.е. задержка получения ответа максимум в 0,1 с.
* Перезапуск бота периодически вызывает конфликты 409 - повторного запуска опроса ответов. Помогает перезагрузка хаба

## 12. Примеры. 

Reply клавиатуры. Отображаются как кнопки вместо клавиатуры

```js
var replyKeyboardSets = {
    mainMenu: {
        rows: [
            ['🍔🍿 МИНИ‑ФЕСТ 🤪📊🎁'],
            ['⚡ Акции и новинки'],
            ['📌 Найти ближайшее предприятие'],
            ['🍔 Меню «Вкусно — и точка»']
        ],
        oneTime: true   // ← keyboard will hide after first click
    },
    yesNo: [
        ['Yes'],
        ['No'],
        ['Тест']
    ]
};
```

Список кнопок и их обработчиков
Включает оработку кнопок inline (кнопки как часть соообщения в чате) и reply (кнопки вместо клавиатуры)

```js
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
```

Команды бота
Включает список всех команд. Все команды автоматически регестрируются в help
Команды могут принимать атрибуты, например `/temp 15` обработает и покажет введенный параметр 15.

```js
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
```

Отправка интерактивного сообщения с inline кнопками. Вызывайте в блочном сценарии
```js
global.TGActions.sendInteractiveMessage(
     'botName1',
     'chatName1',
     'getServ',
     'Выбирайте сервис',
     true
 );
```
## 13. Создание бота

Для этого необходимо в Telegram в поиске вбить @BotFather (это официальный бот для создания ботов)

После этого, необходимо:

Шаг 1: Нажмите «Запустить» для активации бота BotFather. В ответ вы получите список команд по управлению ботов.

Шаг 2: Выполнить команду /newbot

Шаг 3: Дать имя своему боту — например "Мой дом" и присвоить никнейм бота, по которому вы сможете его найти. Он должен быть уникальным и заканчиваться на слово «bot».

После этого вы получите сообщение, которое будет содержать ссылку на вашего бота, а также токен для авторизации в Sprut.hub или другой системе управления умным домом.

Шаг 4: Далее вам необходимо узнать ваш chatID. Для этого вам нужно подключиться к этому боту, который и сообщит вам ваш chatID. Если же вам нужно, чтобы ваш бот присылал сообщения в какой нибудь общий канал Telegram, то вам нужно выяснить ID этого канала. Для этого, необходимо переслать сообщение из этого канала тому же боту, чтобы он вам сообщил ID чата, из которого вы переслали сообщение.

Шаг 5: Чтобы начать пользоваться ботом, нужно начать с ним чат и нажать кнопку "Запустить"

## 14. ChangeLOG

#v0.5.2#03.07.25
Первая альфа-версия

---

## 15. Разработка (структура репозитория)

Код сценариев живёт в `src/` — это **источник правды**. Корневые `*.json` —
экспорты для импорта в Sprut.hub, они **генерируются** из `src/`.

| Файл в `src/` | Сценарий |
|---|---|
| `01-logger.js` | Logger |
| `02-settings.js` | Telegram for Sprut. Part 1. ReadMe and Settings |
| `03-engine.js` | Telegram for Sprut. Part 2. Engine |
| `04-autostart.blocks.json` + `04-autostart.code.1.js` | Telegram for Sprut. Part 3. Auto start bot (блочный: граф блоков отдельно, код блока отдельно) |

В `04-autostart.blocks.json` поле `code` содержит ссылку `@file:04-autostart.code.1.js`;
при сборке она подставляется содержимым файла.

Соответствие «экспорт ↔ имя в `src/`» задано в `tools/scenarios.json`. Новый сценарий
нужно завести там, иначе `extract`/`build` откажутся работать.

**Цикл работы**

```bash
# после экспорта сценариев из хаба — обновить src/
python3 tools/scenarios.py extract

# после правки кода в src/ — пересобрать экспорты
python3 tools/scenarios.py build

# сверка без записи (годится как гейт перед коммитом), exit 1 при расхождении
python3 tools/scenarios.py check
```

**Правила**

* Корневые `*.json` вручную не править — правка потеряется при следующем `build`.
  Правим `src/`, затем `build`.
* Перед коммитом прогонять `check`: он ловит ситуацию «код поменяли в `src/`,
  а экспорт не пересобрали» (и наоборот).
* Сборка байт-в-байт: в GLOBAL-сценариях переводы строк — CRLF, нормализация EOL
  ломает round-trip. Это закреплено в `.gitattributes`, снимать нельзя.