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

// ─────────────────────────────  Фикстура настроек  ─────────────────────────
const settings = {
    // Значения по умолчанию для setBotMeta: боты без description/shortDescription
    // должны брать их отсюда, а не из свободных глобальных переменных.
    botDescription: 'описание из настроек',
    botShortDescription: 'коротко из настроек',
    bots: {
        _default: 'botName1',
        // pollTimeout намеренно не задан: так исполняется ветка с
        // CONSTANTS.DEFAULT_POLL_TIMEOUT (иначе значение из фикстуры её закрывает).
        botName1: {
            key: 'TESTKEY',
            description: 'desc',
            shortDescription: 'short',
            updateInterval: 0
        },
        // Описаний нет: исполняется ветка «подставить значения из настроек».
        botName2: { key: 'TESTKEY2', updateInterval: 0 },
        // Тот же случай, но настройки для него будут временно сняты:
        // исполняется ветка «нечего ставить, пропускаем вызов».
        botName3: { key: 'TESTKEY3', updateInterval: 0 }
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
            params: ctx && ctx.params ? ctx.params : null
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
            { update_id: 10, message: { chat: { id: 111 }, text: '/help arg1 arg2' } },
            { update_id: 11, message: { chat: { id: 111 }, text: 'Меню A' } },
            // Текст ВТОРОЙ кнопки набора: если сверка btn.text отвалится,
            // сработает первая кнопка и трасса разъедется.
            { update_id: 110, message: { chat: { id: 111 }, text: 'Меню B' } },
            // Текста нет ни в одной кнопке — ветка «ничего не совпало».
            { update_id: 111, message: { chat: { id: 111 }, text: 'просто текст' } },
            { update_id: 12, message: { chat: { id: 999 }, text: 'чужой чат' } },
            {
                update_id: 13,
                callback_query: {
                    id: 'cq1',
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

// ───────────────  null-аргументы: bots._default / chats._default  ───────────
// _default в настройках — АЛИАС ('botName1' / 'chatName1'), а не конфиг и не
// chat_id. Если его не развернуть, в URL уезжает /botundefined/…, а chat_id
// становится строкой 'chatName1'. Ниже — вызовы ровно того вида, который
// обещан в README (§3.1, §3.2).
step('sendSimpleMessage(null, null)', function () {
    TG.sendSimpleMessage(null, null, 'бот и чат по умолчанию');
});
step('sendSimpleMessage(undefined, undefined)', function () {
    TG.sendSimpleMessage(undefined, undefined, 'аргументы не переданы');
});
step('sendInteractiveMessage(null, null)', function () {
    TG.sendInteractiveMessage(null, null, 'yesNo', 'Выберите');
});
step('sendReplyKeyboard(null, null)', function () {
    TG.sendReplyKeyboard(null, null, 'mainMenu', 'Меню');
});
step('removeReplyKeyboard(null, null)', function () {
    TG.removeReplyKeyboard(null, null, 'снято');
});
step('null-бот при живом имени чата', function () {
    TG.sendSimpleMessage(null, 'chatName2', 'смешанный вызов');
});
step('bots._default указывает в никуда', function () {
    settings.bots._default = 'нетТакогоБота';
    try {
        TG.sendSimpleMessage(null, null, 'привет');
    } finally {
        settings.bots._default = 'botName1';
    }
});
step('chats._default указывает в никуда', function () {
    settings.chats._default = 'нетТакогоЧата';
    try {
        TG.sendSimpleMessage(null, null, 'привет');
    } finally {
        settings.chats._default = 'chatName1';
    }
});

// ──────────────────  setBotMeta без описаний у самого бота  ─────────────────
// Раньше здесь были свободные BOT_DESCRIPTION / BOT_SHORT_DESCRIPTION —
// ReferenceError вылетал до try и убивал registerBotCommands целиком.
step('setBotMeta: описания из настроек', function () {
    TG.startPolling('botName2');
    TG.stopPolling('botName2');
});
step('setBotMeta: описаний нет нигде', function () {
    const savedD = settings.botDescription;
    const savedSD = settings.botShortDescription;
    delete settings.botDescription;
    delete settings.botShortDescription;
    try {
        TG.startPolling('botName3');
        TG.stopPolling('botName3');
    } finally {
        settings.botDescription = savedD;
        settings.botShortDescription = savedSD;
    }
});
step('остаток таймеров (после null-сценария)', function () { flush(5); });

process.stdout.write(JSON.stringify(trace, null, 2) + '\n');
