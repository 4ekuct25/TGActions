/**
 * Стенд для сверки поведения движка TGActions вне Sprut.hub.
 *
 *     node tools/engine-harness.js <путь-к-скрипту-движка>
 *
 * Поднимает заглушки окружения хаба (global.TGActionsSettings, LoggerFactory,
 * HttpClient, таймеры, Date), прогоняет фиксированный сценарий и печатает
 * детерминированную трассу: HTTP-вызовы, строки лога, заведённые таймеры,
 * срабатывания пользовательских обработчиков.
 *
 * Смысл — A/B: трасса старого движка и трасса нового должны совпасть
 * побайтово. Стенд не заменяет проверку в хабе, но ловит регрессии
 * рефакторинга до импорта.
 */

'use strict';

const fs = require('fs');
const vm = require('vm');

const enginePath = process.argv[2];
if (!enginePath) {
    console.error('usage: node tools/engine-harness.js <engine.js>');
    process.exit(2);
}

const trace = { http: [], logs: [], timers: [], handlers: [] };

// Автор входящих сообщений — участник семейного чата.
// Объявлено до getUpdatesScript: тот вызывает updatesBatch() на этапе инициализации модуля.
const SENDER = { id: 555001, username: 'family_member', first_name: 'Аноним' };

// ─────────────────────────────  Фикстура настроек  ─────────────────────────
const settings = {
    bots: {
        _default: 'botName1',
        // pollTimeout намеренно не задан: так исполняется ветка с
        // CONSTANTS.DEFAULT_POLL_TIMEOUT (иначе значение из фикстуры её закрывает).
        botName1: {
            key: 'TESTKEY',
            description: 'desc',
            shortDescription: 'short',
            updateInterval: 0
        }
    },
    chats: {
        _default: 'chatName1',
        chatName1: '111',
        chatName2: '222'
    },
    replyKeyboardSets: {
        mainMenu: { rows: [['Меню A'], ['Меню B']], oneTime: true },
        legacyMenu: [['Старый A', 'Старый B']]
    },
    buttonSets: {
        mainMenu: [
            [{ text: 'Меню A', handler: mark('btn:mainMenu:A'), response: 'ответ A' }],
            [{ text: 'Меню B', handler: mark('btn:mainMenu:B') }]
        ],
        yesNo: [[{ text: 'Да', handler: mark('btn:yesNo:да'), response: 'ок' },
                 { text: 'Нет', handler: mark('btn:yesNo:нет') }]]
    },
    botCommands: {
        help: { description: 'помощь', handler: mark('cmd:help') },
        status: { description: 'статус', handler: mark('cmd:status') }
    }
};

function mark(name) {
    return function (ctx) {
        trace.handlers.push({
            name: name,
            chatId: ctx && ctx.chatId !== undefined ? String(ctx.chatId) : null,
            text: ctx && ctx.messageText ? ctx.messageText : null,
            params: ctx && ctx.params ? ctx.params : null,
            // Автор сообщения: без этих полей в трассе проброс msg.from не виден,
            // и A/B показал бы «ничего не изменилось» на изменившемся поведении.
            userId: ctx && ctx.userId !== undefined ? ctx.userId : '(нет поля)',
            userName: ctx && ctx.userName !== undefined ? ctx.userName : '(нет поля)',
            // Обработчик inline-кнопки раньше не получал имя бота и не мог
            // ответить в тот же чат. Без записи в трассу правка непокрыта.
            botName: ctx && ctx.botName !== undefined ? ctx.botName : '(нет поля)'
        });
    };
}

// ─────────────────────────────────  Логгер  ────────────────────────────────
function makeLogger(name) {
    function log(level) {
        return function (msg) {
            const args = Array.prototype.slice.call(arguments, 1);
            let i = 0;
            const rendered = String(msg).replace(/\{\}/g, function () {
                return i < args.length ? render(args[i++]) : '{}';
            });
            trace.logs.push(level + ' [' + name + '] ' + rendered);
        };
    }
    return { info: log('info'), warn: log('warn'), error: log('error'), debug: log('debug') };
}

function render(v) {
    if (v === null || v === undefined) return String(v);
    if (typeof v === 'object') {
        try { return JSON.stringify(v); } catch (e) { return '[obj]'; }
    }
    return String(v);
}

// ────────────────────────────────  HttpClient  ─────────────────────────────
// Очередь ответов на getUpdates: прогоняем все ветки pollOnce.
// 409 подряд восемь раз: streak растёт до 8, back-off упирается в потолок
// 60 000 мс (10000 * 7 = 70000 > 60000). Без такой длины ветка ограничения
// не исполняется и мутация порога не ловится.
const getUpdatesScript = [
    { status: 200, body: updatesBatch() },
    { status: 409, body: '' },   // первый 409 → deleteWebhook
    { status: 409, body: '' },   // повторные 409 → растущий back-off
    { status: 409, body: '' },
    { status: 409, body: '' },
    { status: 409, body: '' },
    { status: 409, body: '' },   // здесь back-off должен упереться в потолок
    { status: 409, body: '' },
    { status: 409, body: '' },
    { status: 503, body: '' },
    { status: 418, body: '' },   // неожиданный статус
    { status: 200, body: JSON.stringify({ ok: true, result: [] }) }
];
let getUpdatesIdx = 0;
let messageIdSeq = 1000;

function updatesBatch() {
    return JSON.stringify({
        ok: true,
        result: [
            { update_id: 10, message: { chat: { id: 111 }, from: SENDER, text: '/help arg1 arg2' } },
            // В группах Telegram дописывает имя бота к команде. Без этого случая
            // поломка групповых команд стендом не ловится.
            { update_id: 100, message: { chat: { id: 111 }, from: SENDER, text: '/status@MyHomeBot' } },
            // Сообщение вообще без from (служебное/канальное) — проброс автора не должен падать.
            { update_id: 101, message: { chat: { id: 111 }, text: '/status' } },
            { update_id: 11, message: { chat: { id: 111 }, from: SENDER, text: 'Меню A' } },
            // Текст ВТОРОЙ кнопки набора: если сверка btn.text отвалится,
            // сработает первая кнопка и трасса разъедется.
            { update_id: 110, message: { chat: { id: 111 }, from: SENDER, text: 'Меню B' } },
            // Текста нет ни в одной кнопке — ветка «ничего не совпало».
            { update_id: 111, message: { chat: { id: 111 }, text: 'просто текст' } },
            { update_id: 12, message: { chat: { id: 999 }, text: 'чужой чат' } },
            {
                update_id: 13,
                callback_query: {
                    id: 'cq1',
                    from: SENDER,
                    data: 'yesNo:0:0:chatName1',
                    message: { chat: { id: 111 } }
                }
            },
            {
                update_id: 14,
                callback_query: {
                    id: 'cq2',
                    data: 'yesNo:0:1:chatName1',
                    message: { chat: { id: 999 } }
                }
            },
            { update_id: 15, message: { chat: { id: 111 }, text: '/unknownCmd' } }
        ]
    });
}

function respond(method, url) {
    if (url.indexOf('/getUpdates') !== -1) {
        const r = getUpdatesScript[Math.min(getUpdatesIdx, getUpdatesScript.length - 1)];
        getUpdatesIdx += 1;
        return r;
    }
    if (url.indexOf('/sendMessage') !== -1) {
        messageIdSeq += 1;
        return { status: 200, body: JSON.stringify({ ok: true, result: { message_id: messageIdSeq } }) };
    }
    return { status: 200, body: JSON.stringify({ ok: true }) };
}

function request(method, url) {
    const record = { method: method, url: url, query: [], headers: [], body: null };
    const api = {
        queryString: function (k, v) { record.query.push([k, render(v)]); return api; },
        header: function (k, v) { record.headers.push([k, render(v)]); return api; },
        body: function (b) { record.body = String(b); return api; },
        send: function () {
            const r = respond(method, url);
            record.status = r.status;
            trace.http.push(record);
            return {
                getStatus: function () { return r.status; },
                getBody: function () { return r.body; }
            };
        }
    };
    return api;
}

const HttpClient = {
    GET: function (url) { return request('GET', url); },
    POST: function (url) { return request('POST', url); }
};

// ─────────────────────────  Виртуальные таймеры и время  ───────────────────
let clock = 0;
let timerSeq = 0;
let pending = [];

function setTimeoutStub(fn, delay) {
    timerSeq += 1;
    const t = { id: timerSeq, at: clock + (delay || 0), seq: timerSeq, fn: fn, delay: delay || 0 };
    pending.push(t);
    trace.timers.push({ delay: t.delay });
    return t.id;
}

function clearTimeoutStub(id) {
    if (id === null || id === undefined) return;
    const realId = typeof id === 'object' ? id.id : id;
    pending = pending.filter(function (t) { return t.id !== realId; });
    trace.timers.push({ cleared: true });
}

/** Выполняет до n ближайших таймеров (в порядке времени, затем постановки). */
function flush(n) {
    for (let i = 0; i < n; i++) {
        if (!pending.length) return;
        pending.sort(function (a, b) { return a.at - b.at || a.seq - b.seq; });
        const t = pending.shift();
        clock = t.at;
        t.fn();
    }
}

class FixedDate {
    toTimeString() { return '00:00:00 GMT+0000'; }
}

// ──────────────────────────────  Запуск движка  ────────────────────────────
const sandbox = {
    global: { TGActionsSettings: settings, LoggerFactory: { create: makeLogger } },
    HttpClient: HttpClient,
    setTimeout: setTimeoutStub,
    clearTimeout: clearTimeoutStub,
    Date: FixedDate,
    JSON: JSON,
    Object: Object,
    Array: Array,
    String: String,
    Number: Number,
    Error: Error,
    RegExp: RegExp,
    console: console
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(enginePath, 'utf8'), sandbox, { filename: enginePath });

const TG = sandbox.TGActions;
sandbox.global.TGActions = TG;

function step(name, fn) {
    trace.logs.push('--- ' + name + ' ---');
    try {
        fn();
    } catch (e) {
        trace.logs.push('!!! исключение в шаге ' + name + ': ' + e.message);
    }
}

// ────────────────────────────────  Сценарий  ───────────────────────────────
step('публичный API', function () {
    trace.logs.push('keys: ' + Object.keys(TG).sort().join(','));
});
step('sendSimpleMessage', function () {
    TG.sendSimpleMessage('botName1', 'chatName1', 'Привет');
});
step('sendSimpleMessage массив + notify=false', function () {
    TG.sendSimpleMessage('botName1', 'chatName1', ['строка 1', 'строка 2'], false);
});
step('sendSimpleMessage autoDelete', function () {
    TG.sendSimpleMessage('botName1', 'chatName1', 'исчезну', { autoDeleteAfterSec: 1 });
});
step('sendInteractiveMessage', function () {
    TG.sendInteractiveMessage('botName1', 'chatName1', 'yesNo', 'Выберите');
});
step('sendInteractiveMessage несуществующий набор', function () {
    TG.sendInteractiveMessage('botName1', 'chatName1', 'нетТакого', 'Выберите');
});
step('sendReplyKeyboard объектный формат (oneTime)', function () {
    TG.sendReplyKeyboard('botName1', 'chatName1', 'mainMenu', 'Меню');
});
step('sendReplyKeyboard старый формат (массив)', function () {
    TG.sendReplyKeyboard('botName1', 'chatName2', 'legacyMenu', 'Меню 2');
});
step('sendReplyKeyboard несуществующий набор', function () {
    TG.sendReplyKeyboard('botName1', 'chatName1', 'нетТакого', 'Меню');
});
step('registerReplyKeyboardSet', function () {
    TG.registerReplyKeyboardSet('adhoc', [['A', 'B']]);
    TG.registerReplyKeyboardSet('плохой', 'не массив');
});
step('startPolling', function () {
    TG.startPolling('botName1');
});
step('startPolling повторно', function () {
    TG.startPolling('botName1');
});
getUpdatesScript.forEach(function (r, i) {
    step('poll #' + (i + 1) + ' (ответ ' + r.status + ')', function () { flush(1); });
});
// Настройки на время исчезают — ровно то, что происходит при переустановке
// сценария в хабе. Цепочка опроса обязана пережить это и продолжиться.
step('настройки исчезли на один опрос', function () {
    const saved = sandbox.global.TGActionsSettings;
    sandbox.global.TGActionsSettings = undefined;
    const timersBefore = trace.timers.length;
    flush(1);
    sandbox.global.TGActionsSettings = saved;
    trace.logs.push('--- таймеров заведено после сбоя: '
        + (trace.timers.length - timersBefore > 0 ? 'да' : 'НЕТ, цепочка оборвалась') + ' ---');
});
step('опрос продолжается после сбоя', function () { flush(1); });

step('stopPolling', function () {
    TG.stopPolling('botName1');
});
step('stopPolling повторно', function () {
    TG.stopPolling('botName1');
});
step('removeReplyKeyboard', function () {
    TG.removeReplyKeyboard('botName1', 'chatName1', 'снято');
});
step('rebootPolling', function () {
    TG.rebootPolling('botName1');
    flush(3);
});
step('неизвестный бот', function () {
    TG.sendSimpleMessage('нетТакогоБота', 'chatName1', 'привет');
});
step('чат по числовому id', function () {
    TG.sendSimpleMessage('botName1', '-100500', 'привет');
});
step('неизвестный чат', function () {
    TG.sendSimpleMessage('botName1', 'нетТакогоЧата', 'привет');
});
step('остаток таймеров', function () { flush(5); });

process.stdout.write(JSON.stringify(trace, null, 2) + '\n');
