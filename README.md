# Документация по модулю **TGActions**

---

## 0. Что делает TGActions

`TGActions` — это вспомогательный модуль, который облегчает интеграцию Telegram-ботов в сценарии «Умного дома» для Sprut. Все функции модуля выполняются через API Telegram. 
Он берёт на себя:

* отправку простых сообщений, inline-кнопок и reply-клавиатур;
* регистрацию команд и описание бота в Telegram;
* long-polling (получение обновлений без веб-хуков);
* автоматику перезапуска при сетевых ошибках;
* whitelisting допустимых чатов.

---

## 1. Первичная настройка
Установить сценарии (порядок установки и исполнения сценариев важен)
* Logger
* Telegram for Sprut. Part 1. ReadMe and Settings
* Telegram for Sprut. Part 2. Engine
* Telegram for Sprut. Part 3. Auto start bot
Вручную заполнить в сценарии Telegram for Sprut. Part 1. ReadMe and Settings
* bots. Список ботов. См. п. 3.1. 
* chats. Список допустимых чатов. См. п. 3.2.
* replyKeyboardSets. Список replyKeyboard. См. п. 3.3.
* buttonSets. Список обработчиков кнопок. См. п. 3.4.
* botCommands. Список команд бота. См. п. 3.5.

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

## 12. Заключение

`TGActions` предоставляет готовый «скелет» Telegram-бота: минимально хватает настроить объект **TGActionsSettings**, вызвать `startPolling()` и определить пару команд. Далее вы добавляете сценарии умного дома, кнопки и клавиатуры без лишней рутины.

Удачной автоматизации!

## 13. ChangeLOG

#v0.1.0#03.07.25
Первая альфа-версия