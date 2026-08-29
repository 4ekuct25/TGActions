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

* Telegram for Sprut. Part 1. ReadMe and Settings
* Telegram for Sprut. Part 2. Engine

> Сценарий **Logger** больше не нужен. Движок пишет в `log` — глобальный объект
> хаба — напрямую, формат строки прежний (`Info: TGActions#версия, текст`).
> Файл `1. Logger.json` остался в репозитории как артефакт исходного модуля,
> но в хаб не устанавливается: это был лишний сценарий и лишняя точка отказа —
> порядок загрузки глобальных сценариев хаб не гарантирует, и без Logger движок
> падал на инициализации.

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
// Описания по умолчанию: подставляются, если у бота ниже
// не заданы description / shortDescription
botDescription: 'Управление умным домом на базе Sprut.hub',
botShortDescription: 'Умный дом',

bots: {
    _default: 'botName1',   // ИМЯ бота, используется, если botName == null
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
* **\_default** — это *имя* бота, а не его конфиг: движок сначала разворачивает
  алиас, потом берёт `bots[имя]`. Если алиас указывает в никуда — ошибка
  `Bot "…" not found`, а не молчаливая отправка с пустым токеном.
* **botDescription / botShortDescription** — описания по умолчанию, движок
  читает их из объекта настроек (`src/02-settings/index.js`). Если описание не
  задано ни у бота, ни здесь — движок пропускает вызов `setMyDescription`
  (пустая строка в Telegram стёрла бы описание) и пишет предупреждение в лог.
  Лимиты Telegram: описание ≤ 512 символов, короткое ≤ 120.

### 3.2. Чаты (`chats`)

```js
chats: {
    _default: 'chatName1', // ИМЯ чата, используется, если chatName == null
    chatName1: '399310593',  // chat_id (числом или строкой)
    chatName2: '-1009876543210'
}
```

Все входящие сообщения из chat\_id, **не** присутствующих в этом списке, игнорируются.

`_default`, как и у ботов, — *имя* чата, а не `chat_id`: движок разворачивает
алиас и подставляет `chats[имя]`. Помимо имени в качестве `chatName` можно
передать сам `chat_id` числом или строкой.

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

Вместо имени бота и чата можно передать `null` (или не передать вовсе) —
подставятся `bots._default` и `chats._default`:

```js
TGActions.sendSimpleMessage(null, null, 'Сообщение боту и в чат по умолчанию');
TGActions.sendSimpleMessage(null, 'chatName2', 'Бот по умолчанию, чат явный');
```

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
| `01-logger.js` | Logger — **не устанавливается**, движку не нужен (см. п. 1) |
| `02-settings/` | Telegram for Sprut. Part 1. ReadMe and Settings (модули, см. 15.2) |
| `03-engine/` | Telegram for Sprut. Part 2. Engine (разложен на модули, см. 15.1) |
| `04-autostart.blocks.json` + `04-autostart.code.1.js` | Telegram for Sprut. Part 3. Auto start bot (блочный: граф блоков отдельно, код блока отдельно) |

В `04-autostart.blocks.json` поле `code` содержит ссылку `@file:04-autostart.code.1.js`;
при сборке она подставляется содержимым файла.

Соответствие «экспорт ↔ имя в `src/`» задано в `tools/scenarios.json`. Новый сценарий
нужно завести там, иначе `extract`/`build` откажутся работать. Поле `layout` там же
различает одиночный файл (`file`) и каталог модулей (`modules`).

### 15.1. Модули движка (`src/03-engine/`)

Движок собирается из модулей: каждый файл — самостоятельная фабрика
`function TGActionsXxx(ns) { … return {…}; }`, зависимости объявлены явно в
первых строках тела. Сборщик кладёт все фабрики внутрь одной IIFE и вызывает
`TGActionsIndex()`, так что наружу по-прежнему торчит только `var TGActions`
с публичным API — внутренние имена в глобальную область не утекают.

| Модуль | Отвечает за | Зависит от |
|---|---|---|
| `constants.js` | версия, константы Telegram Bot API | — |
| `logger.js` | обёртка над `global.LoggerFactory` | — |
| `state.js` | контейнеры состояния опроса, whitelist чатов | — |
| `helpers.js` | `getBot`, `getChat`, сборка URL, таймеры | logger, constants |
| `messaging.js` | отправка/удаление сообщений, клавиатуры | logger, constants, helpers, state |
| `bot-meta.js` | описание бота в Telegram | logger, constants, helpers |
| `commands.js` | регистрация команд | logger, helpers, state, botMeta |
| `handlers.js` | callback-кнопки, команды, reply-кнопки | logger, helpers, state, messaging |
| `updates.js` | разбор пачки updates | state, handlers |
| `polling.js` | жизненный цикл long-polling, 503/409, back-off | logger, constants, helpers, state, commands, updates |
| `index.js` | сборка ns и публичный API | все |

Порядок создания модулей задан в `index.js` и повторяет таблицу сверху вниз —
менять его нельзя, модуль получает `ns` уже заполненным своими зависимостями.
`banner.js` и `examples.js` — комментарии, они кладутся вне IIFE.
Порядок склейки описан в `src/03-engine/modules.json`.

Собранный `3. …Engine.json` — артефакт: править его руками бессмысленно,
`build` перезапишет.

### 15.2. Управление домом (`src/02-settings/`)

**Списка устройств в репозитории нет и быть не должно.** Он строится обходом хаба
(`Hub.getRooms()` → аксессуары → видимые сервисы → характеристики) при инициализации
сценария и обновляется командой `/refresh`. Новое устройство в хабе появляется в меню
само; перепаривание не оставляет ссылок в никуда.

| Модуль | Отвечает за |
|---|---|
| `actions.js` | какие типы характеристик считать действием и чем их рисовать |
| `access.js` | профили чатов и белый список людей — **единственное место политики** |
| `discovery.js` | обход хаба, чтение и запись значений |
| `menu.js` | сборка inline-меню комната → устройство → действие |
| `commands.js` | `/home`, `/status`, `/who`, `/refresh`, `/help` |
| `index.js` | сборка и объект `TGActionsSettings` |

Отбор в меню — **белый список**: попадает только то, для чего есть правило в `ACTIONS`
или `READONLY`. Отдельного чёрного списка нет намеренно: он был, но не отсекал ничего
сверх белого списка и лишь создавал видимость фильтра. Спрятать конкретное устройство
или пометить его критичным — через `OVERRIDES` по адресу `'aId,cId'`.

**Секреты не хранятся в репозитории.** Токен бота, id чатов и белый список людей
живут в `src/02-settings/local.js` — он в `.gitignore`. В отслеживаемых файлах на их
месте плейсхолдеры «Заполнить». Репозиторий публичный, и коммит с токеном означал бы
его немедленный отзыв.

```bash
cp src/02-settings/local.example.js src/02-settings/local.js
# заполнить, затем собрать версию для хаба:
python3 tools/scenarios.py build --local     # положит в dist/, тоже вне git
```

Импортировать в хаб надо файлы из **`dist/`**, а не из корня: в корне лежит сборка с
плейсхолдерами, её коммитим. Если `local.js` нет или в нём чего-то не хватает,
`build --local` говорит об этом вслух — молча уехавший плейсхолдер выглядит как
рабочая конфигурация.

**Порядок первого запуска.** `chatId` семейной группы и `user_id` домашних заранее
неоткуда взять: их отдаёт только Telegram. Поэтому сначала заполняется токен, бот
запускается, каждый пишет ему `/who` — команда отвечает своим `user_id` и `chat_id`
текущего чата, — и уже эти значения попадают в `local.js`.

**Модель доступа.** Действие разрешено, если комната входит в профиль чата **и**
(действие не критичное **или** и профиль, и человек допущены к критичному). Критичное
в неподходящем профиле не просто запрещено — его кнопок физически нет в меню, но
проверка в обработчике всё равно выполняется: она ловит чужого человека в своём чате.

**Меню — inline, не reply-клавиатура.** В группе бот по умолчанию не видит обычный
текст (Privacy Mode), а `callback_query` приходит всегда. Имена наборов кнопок короткие
намеренно: они уезжают в `callback_data` с лимитом 64 байта, а кириллица там по два
байта на символ.

**Ограничение хаба, которое определило архитектуру.** Глобальному сценарию Sprut.Hub
запрещено менять характеристики устройств и ставить таймеры — причём **молча**:
исключение не бросается, `try/catch` отказ не видит, ошибка есть только в журнале хаба.
Работает это только когда вызов пришёл по цепочке от блочного сценария — то есть от
`Part 3. Auto start bot`. Поэтому автозапуск обязателен, а не «желателен».
Подробности и как проверялось — в `JOURNAL.md`.

И: **значение после записи читать нельзя** — оно доезжает асинхронно, немедленное
чтение возвращает старое. Бот подтверждает намерение, а не результат.

**Цикл работы**

```bash
# после экспорта сценариев из хаба — обновить src/
python3 tools/scenarios.py extract

# после правки кода в src/ — пересобрать экспорты
python3 tools/scenarios.py build

# сверка без записи, exit 1 при расхождении
python3 tools/scenarios.py check
```

> `extract` не трогает сценарии с `layout: modules` и говорит об этом: хаб отдаёт
> движок одним куском, обратно по модулям он не раскладывается. Если движок
> правили прямо в хабе — переносить правки в `src/03-engine/` придётся руками.

**Проверка движка вне хаба**

```bash
# прогнать движок через заглушки хаба и напечатать трассу
# (HTTP-вызовы, лог, таймеры, срабатывания обработчиков)
node tools/engine-harness.js <путь-к-собранному-скрипту>

# прогнать настройки: обход хаба по фикстуре, меню, политика доступа
# exit 1, если хоть одна проверка провалена
node tools/settings-harness.js

# проверить, что у стендов есть зубы: внести по дефекту в каждый модуль
# и убедиться, что движок меняет трассу, а настройки — валят проверки
python3 tools/mutation-check.py
```

Фикстура хаба — `tools/fixtures/hub-usadba.json`, снята с живого хаба «Усадьба».
Она нужна, чтобы проверять отбор устройств и политику доступа без самого хаба.

Сценарий стенда движка заканчивается блоком с `null`-аргументами (`bots._default` /
`chats._default`, включая случай «алиас указывает в никуда») и вызовом
`setBotMeta` для бота без собственных описаний. Эти шаги идут **после**
основного сценария: так трасса основной части остаётся сравнимой с ранее
снятой.

Стенд полезен как A/B: снять трассу до правки и после, они должны совпасть,
если правка задумана как рефакторинг без смены поведения. Одна ветка стендом
принципиально не покрывается — защита от повторного входа в `pollOnce`
(`inFlight`): в стенде HTTP синхронный и поток один. Она перечислена в
`tools/mutation-check.py` как осознанная слепая зона.

**Pre-commit хук**

Гейт «код в `src/` поменяли, а экспорт не пересобрали» повешен на pre-commit.
Хук версионируется (`tools/hooks/pre-commit`), но `core.hooksPath` — локальная
настройка, поэтому **в каждом клоне репозитория её нужно включить один раз**:

```bash
git config core.hooksPath tools/hooks
```

Хук сверяет **индекс**, а не рабочее дерево: коммит фиксирует индекс, и сверка
рабочего дерева пропустила бы коммит, где правка `src/` застейджена, а
пересобранный `*.json` — нет. Разовый осознанный обход — `git commit --no-verify`.

**Правила**

* Корневые `*.json` вручную не править — правка потеряется при следующем `build`.
  Правим `src/`, затем `build`.
* Сборка байт-в-байт: в GLOBAL-сценариях переводы строк — CRLF, нормализация EOL
  ломает round-trip. Это закреплено в `.gitattributes`, снимать нельзя.