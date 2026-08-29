/**
 * Стенд для сценария настроек: обход хаба, политика доступа, меню.
 *
 *     node tools/settings-harness.js [<путь-к-собранному-скрипту>]
 *
 * Поднимает заглушку Hub по фикстуре tools/fixtures/hub-usadba.json (снята с
 * живого хаба «Усадьба»), загружает собранный сценарий настроек и прогоняет
 * сценарий использования: /home, переходы по меню, нажатия действий, попытки
 * из чужого чата и от неизвестного человека.
 *
 * Печатает детерминированную трассу: дерево меню, отправленные сообщения,
 * фактические записи в устройства. Годится как A/B при правках.
 *
 * Что стенд НЕ проверяет: реальный Sprut.Hub. В частности, запись из
 * глобального сценария напрямую хаб запрещает молча (см. JOURNAL.md) — здесь
 * запись всегда «проходит».
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const EXPORT = path.join(ROOT, '2. Telegram for Sprut. Part 1. ReadMe and Settings (2).json');

const FAMILY_CHAT = '-1001111111111';
const PRIVATE_CHAT = '235000000';
const OWNER = '111000111';
const KID = '222000222';
const STRANGER = '999000999';

const trace = { menu: [], sent: [], writes: [], errors: [] };
const BACK_LABEL = '\u2039 Назад';

// ─────────────────────────────  Заглушка хаба  ──────────────────────────────
const fixture = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'fixtures', 'hub-usadba.json'), 'utf8'));

const values = {};   // 'aId,cId' -> текущее значение

function makeCharacteristic(c, aId, sId, accessory, service) {
    const key = aId + ',' + c.cId;
    values[key] = c.value;
    return {
        getUUID: () => aId + '.' + sId + '.' + c.cId,
        getType: () => c.type,
        getName: () => c.name,
        getMinValue: () => (c.min === null ? null : c.min),
        getMaxValue: () => (c.max === null ? null : c.max),
        getMinStep: () => (c.step === null ? null : c.step),
        getValue: () => values[key],
        setValue: (v) => { values[key] = v; },
        getAccessory: () => accessory,
        getService: () => service
    };
}

function makeRooms(src) {
  return src.rooms.map((room) => {
    const accessories = room.accessories.map((a) => {
        const accessory = {};
        const services = a.services.map((s) => {
            const service = {};
            const chars = s.characteristics.map(
                (c) => makeCharacteristic(c, a.aId, s.sId, accessory, service));
            Object.assign(service, {
                getName: () => s.name,
                getType: () => s.type,
                isVisible: () => s.visible !== false,
                getCharacteristics: () => chars,
                getAccessory: () => accessory
            });
            return service;
        });
        Object.assign(accessory, {
            getName: () => a.name,
            getServices: (visible) => (visible ? services.filter((s) => s.isVisible()) : services)
        });
        return accessory;
    });
    return { getName: () => room.name, getAccessories: () => accessories };
  });
}

const roomObjects = makeRooms(fixture);

const Hub = {
    getRooms: () => roomObjects,
    getAccessories: () => roomObjects.reduce((acc, r) => acc.concat(r.getAccessories()), []),
    getCharacteristicValue: (aId, cId) => {
        const key = aId + ',' + cId;
        if (!(key in values)) throw new Error('нет характеристики ' + key);
        return values[key];
    },
    setCharacteristicValue: (aId, cId, v) => {
        const key = aId + ',' + cId;
        if (!(key in values)) throw new Error('нет характеристики ' + key);
        values[key] = v;
        trace.writes.push({ addr: key, value: v });
    }
};

// ────────────────────────────  Заглушка TGActions  ──────────────────────────
let settings = null;

const TGActions = {
    sendSimpleMessage: (bot, chat, text) => {
        trace.sent.push({ chat: String(chat), text: String(text) });
    },
    sendInteractiveMessage: (bot, chat, setName, text) => {
        trace.sent.push({ chat: String(chat), text: String(text), set: setName });
    }
};

const sandbox = {
    global: { LoggerFactory: { create: () => ({ info() {}, warn() {}, error() {}, debug() {} }) } },
    Hub, JSON, Object, Array, String, Number, Math, Error, RegExp, isNaN, parseInt, parseFloat,
    console
};
sandbox.global.TGActions = TGActions;
vm.createContext(sandbox);

const scriptPath = process.argv[2];
const code = scriptPath
    ? fs.readFileSync(scriptPath, 'utf8')
    : JSON.parse(fs.readFileSync(EXPORT, 'utf8')).scenarioTemplate.data;
vm.runInContext(code, sandbox, { filename: 'settings.js' });

settings = sandbox.TGActionsSettings;
sandbox.global.TGActionsSettings = settings;

// ────────────────────────  Приведение конфига к тестовому  ──────────────────
// Идём ровно тем же путём, что и рабочая сборка для хаба: подмешиваем модуль
// TGActionsLocal. Раньше стенд подменял значения текстовым поиском по коду —
// это проверяло не тот механизм, которым пользуются в бою.
function rebuildWith(config) {
    const local = `function TGActionsLocal() {
        return {
            botKey: 'TEST-TOKEN',
            chats: { f: '${config.family}', p: '${config.private}' },
            users: {
                '${config.owner}': { name: 'Хозяин', critical: true },
                '${config.kid}': { name: 'Ребёнок', critical: false }
            }
        };
    }\n`;
    // local.js в сборке идёт первым модулем — внутри той же IIFE.
    const patched = code.replace(
        /(var TGActionsSettings = \(function \(\) \{\n)/, `$1${local}`);
    if (patched === code) {
        throw new Error('не удалось подмешать TGActionsLocal — изменилась обёртка сборки');
    }
    const box = Object.assign({}, sandbox);
    vm.createContext(box);
    box.global = { LoggerFactory: sandbox.global.LoggerFactory, TGActions };
    vm.runInContext(patched, box, { filename: 'settings.local.js' });
    box.global.TGActionsSettings = box.TGActionsSettings;
    return box.TGActionsSettings;
}

settings = rebuildWith({ family: FAMILY_CHAT, private: PRIVATE_CHAT, owner: OWNER, kid: KID });
sandbox.global.TGActionsSettings = settings;

// ─────────────────────────────  Прогон сценария  ────────────────────────────
function cmd(name, chatId, userId, params) {
    const c = settings.botCommands[name];
    if (!c) { trace.errors.push('нет команды ' + name); return; }
    c.handler({
        botName: 'home', chatId: chatId, userId: userId,
        userName: 'test', params: params || [], message: {}
    });
}

function click(setName, r, c, chatId, userId) {
    const set = settings.buttonSets[setName];
    if (!set) { trace.errors.push('нет набора ' + setName); return null; }
    const rows = Array.isArray(set[0]) ? set : [set];
    const btn = rows[r] && rows[r][c];
    if (!btn) { trace.errors.push('нет кнопки ' + setName + ':' + r + ':' + c); return null; }
    btn.handler({
        botName: 'home', userId: userId, userName: 'test',
        message: { chat: { id: chatId } }, data: setName + ':' + r + ':' + c
    });
    return btn.text;
}

function labelsOf(setName) {
    const set = settings.buttonSets[setName];
    if (!set) return null;
    return (Array.isArray(set[0]) ? set : [set]).map((row) => row.map((b) => b.text));
}

// Чёрный список аксессуаров в репозитории пуст — что прятать, решает хозяин.
// Механизм от этого непроверенным остаться не должен: собираем второй раз с
// подставленным списком и смотрим, что аксессуар исчез вместе с его комнатой.
function buildWithHiddenAccessory(name) {
    const marker = 'var hiddenAccessories = [\n    ];';
    if (!code.includes(marker)) {
        throw new Error('не найден пустой hiddenAccessories — изменился visibility.js');
    }
    const patched = code.replace(marker, `var hiddenAccessories = ['${name}'];`);
    const box = Object.assign({}, sandbox);
    vm.createContext(box);
    box.global = { LoggerFactory: sandbox.global.LoggerFactory, TGActions };
    vm.runInContext(patched, box, { filename: 'settings.hidden.js' });
    box.global.TGActionsSettings = box.TGActionsSettings;
    return box.TGActionsSettings;
}

const out = [];
function say(s) { out.push(s); }

say('=== Обход хаба ===');
const diag = settings._diag;
say(`комнат с содержимым: ${diag.inventory.rooms.length} (${diag.inventory.rooms.join(', ')})`);
say(`действий: ${diag.index.actions}, устройств: ${diag.index.devices}, датчиков: ${diag.inventory.sensors.length}`);
say(`ошибок обхода: ${diag.inventory.errors.length}`);
say('');

say('=== Что отфильтровано ===');
const allTypes = new Set();
for (const room of fixture.rooms) {
    for (const a of room.accessories) {
        for (const s of a.services) for (const c of s.characteristics) allTypes.add(c.type);
    }
}
const kept = new Set([...diag.inventory.actions, ...diag.inventory.sensors].map((i) => i.type));
say('в меню: ' + [...kept].sort().join(', '));
say('отсеяно: ' + [...allTypes].filter((t) => !kept.has(t)).sort().join(', '));
say('');

say('=== Меню семейного чата ===');
const familyHome = labelsOf('fh');
say('комнаты: ' + JSON.stringify(familyHome));
say('');
say('=== Меню личного чата ===');
say('комнаты: ' + JSON.stringify(labelsOf('ph')));
say('');

say('=== Критичное: где видно ===');
for (const key of ['f', 'p']) {
    const found = [];
    for (const name of Object.keys(settings.buttonSets)) {
        if (name[0] !== key) continue;
        for (const row of settings.buttonSets[name]) {
            for (const b of row) {
                if (/Сирена|Кран|Сигнализац/.test(b.text)) found.push(b.text);
            }
        }
    }
    say(`профиль ${key}: ${found.length ? [...new Set(found)].join(', ') : 'критичного нет'}`);
}
say('');

say('=== Сценарий: хозяин в семейном чате включает свет ===');
cmd('home', FAMILY_CHAT, OWNER);
const homeSet = trace.sent[trace.sent.length - 1].set;
const roomIdx = labelsOf(homeSet).findIndex((row) => row[0] === 'Кабинет');
click(homeSet, roomIdx, 0, FAMILY_CHAT, OWNER);
const roomSet = trace.sent[trace.sent.length - 1].set;
say('устройства Кабинета: ' + JSON.stringify(labelsOf(roomSet)));
click(roomSet, 0, 0, FAMILY_CHAT, OWNER);
const devSet = trace.sent[trace.sent.length - 1].set;
say('действия устройства: ' + JSON.stringify(labelsOf(devSet)));
click(devSet, 0, 0, FAMILY_CHAT, OWNER);
const actSet = trace.sent[trace.sent.length - 1].set;
say('кнопки действия: ' + JSON.stringify(labelsOf(actSet)));
const before = trace.writes.length;
click(actSet, 0, 0, FAMILY_CHAT, OWNER);
say('записей в устройства: ' + (trace.writes.length - before)
    + ' ' + JSON.stringify(trace.writes.slice(before)));
say('ответ: ' + trace.sent[trace.sent.length - 1].text);
say('');

say('=== Проверки политики доступа ===');
const failures = [];

/** @param expect 'deny' — записи быть не должно, 'allow' — должна быть ровно одна. */
function expect(title, mode, fn) {
    const n = trace.writes.length;
    const m = trace.sent.length;
    fn();
    const wrote = trace.writes.length - n;
    const answer = trace.sent.length > m ? trace.sent[trace.sent.length - 1].text : '(молча)';
    const ok = mode === 'deny' ? wrote === 0 : wrote === 1;
    if (!ok) failures.push(title + ': ожидали ' + mode + ', записей ' + wrote);
    say(`${ok ? 'ok  ' : 'FAIL'} ${title} [${mode}] записей=${wrote} | ${answer.split('\n')[0]}`);
}

expect('чужой чат', 'deny', () => cmd('home', '-100999', OWNER));
expect('неизвестный человек', 'deny', () => cmd('home', FAMILY_CHAT, STRANGER));
expect('неизвестный жмёт кнопку напрямую', 'deny',
    () => click(actSet, 0, 0, FAMILY_CHAT, STRANGER));
// Ребёнок в белом списке, действие некритичное, комната разрешена профилю —
// это РАЗРЕШЕНО. Ограничение по человеку касается только критичного.
expect('ребёнок жмёт некритичное в семейном чате', 'allow',
    () => click(actSet, 0, 0, FAMILY_CHAT, KID));
say('');

say('=== Критичное действие мимо меню ===');
const criticalItem = diag.inventory.actions.find((a) => a.critical);
const criticalSet = criticalItem ? 'pa' + criticalItem.aId + '_' + criticalItem.cId : null;
say('набор с критичным действием в личке: ' + (criticalSet || 'не найден'));
if (!criticalSet) {
    failures.push('в личном профиле не нашлось критичного действия — проверка не состоялась');
} else {
    expect('ребёнок жмёт критичное в личке', 'deny',
        () => click(criticalSet, 0, 0, PRIVATE_CHAT, KID));
    expect('хозяин жмёт критичное в личке', 'allow',
        () => click(criticalSet, 0, 0, PRIVATE_CHAT, OWNER));
}
say('');

say('=== /status и /who ===');
cmd('status', FAMILY_CHAT, OWNER);
const statusText = trace.sent[trace.sent.length - 1].text;
say('/status: ' + JSON.stringify(statusText.slice(0, 200)));
cmd('who', FAMILY_CHAT, KID);
say('/who: ' + JSON.stringify(trace.sent[trace.sent.length - 1].text));
say('');

say('=== Длина callback_data (лимит Telegram 64 байта) ===');
let maxLen = 0, worst = '';
for (const name of Object.keys(settings.buttonSets)) {
    const rows = settings.buttonSets[name];
    for (let r = 0; r < rows.length; r++) {
        for (let c = 0; c < rows[r].length; c++) {
            const data = [name, r, c, FAMILY_CHAT].join(':');
            const len = Buffer.byteLength(data, 'utf8');
            if (len > maxLen) { maxLen = len; worst = data; }
        }
    }
}
say(`наборов: ${Object.keys(settings.buttonSets).length}, максимум ${maxLen} байт — ${worst}`);
// Идентификаторы наборов не должны зависеть от позиции в списке: иначе
// кнопки в уже отправленных сообщениях после любой перестановки ведут не туда.
const setNames = Object.keys(settings.buttonSets);
const unstable = setNames.filter((n) => /^[fp][rda]\d+_\d+(_\d+)?$/.test(n));
say('имена наборов, похожие на индексные: ' + (unstable.length ? unstable.join(', ') : 'нет'));
say(maxLen <= 64 ? 'в лимит укладывается' : 'ПРЕВЫШЕН ЛИМИТ');
if (maxLen > 64) failures.push('callback_data ' + maxLen + ' байт > 64');
say('');

// Структурные ожидания: они ловят «меню собралось, но не то».
function must(title, ok) {
    if (!ok) failures.push(title);
    say(`${ok ? 'ok  ' : 'FAIL'} ${title}`);
}
say('=== Структурные проверки ===');
must('обход прошёл без ошибок', diag.inventory.errors.length === 0);
// Если бы local.js не подмешался, чаты остались бы плейсхолдерами и
// все проверки доступа проходили бы «отказом» по ложной причине.
must('local.js подставил id чатов',
    settings.chats.f === FAMILY_CHAT && settings.chats.p === PRIVATE_CHAT);
must('пустая комната в меню не попала', diag.inventory.rooms.indexOf('Пустая комната') === -1);
// Скрытая в хабе комната. Фикстура даёт её с пятью устройствами, так что
// «не попала» здесь означает работу фильтра, а не пустоту комнаты.
must('комната из чёрного списка отброшена',
    diag.inventory.rooms.indexOf('Новая комната') === -1
    && !JSON.stringify(labelsOf('ph')).includes('Новая комната')
    && !statusText.includes('Новая комната'));
// Обход хаба в фикстуре намеренно перетасован: без явной сортировки
// комнаты выедут в порядке обхода и проверка упадёт.
must('комнаты по алфавиту',
    JSON.stringify(diag.inventory.rooms)
    === JSON.stringify(['Бойлерная', 'Гостиная', 'Детские комнаты', 'Кабинет', 'Кухня', 'Улица']));
// Чёрный список аксессуаров: в репозитории он пуст, поэтому проверяем на
// подставленном. «Датчик дыма» — единственный аксессуар Кухни, вместе с ним
// должна уйти и комната.
const hiddenAccSettings = buildWithHiddenAccessory('Датчик дыма');
must('аксессуар из чёрного списка отброшен вместе с опустевшей комнатой',
    hiddenAccSettings._diag.inventory.rooms.indexOf('Кухня') === -1
    && diag.inventory.rooms.indexOf('Кухня') !== -1);
must('/status: датчики внутри комнаты по алфавиту',
    statusText.indexOf('Влажность гостиная') < statusText.indexOf('Температура гостиная'));
must('/status: комнаты в порядке хаба',
    statusText.indexOf('*Гостиная*') < statusText.indexOf('*Кухня*'));
must('служебные типы отфильтрованы',
    !kept.has('Identify') && !kept.has('SetupEndpoints') && !kept.has('SelectedRTPStreamConfiguration'));
must('в семейном чате нет Бойлерной',
    JSON.stringify(labelsOf('fh')).indexOf('Бойлерная') === -1);
must('в семейном чате нет критичных кнопок',
    !Object.keys(settings.buttonSets).filter((n) => n[0] === 'f')
        .some((n) => /Сирена|Кран воды|Сигнализац/.test(JSON.stringify(labelsOf(n)))));
must('в личном чате критичное есть',
    Object.keys(settings.buttonSets).filter((n) => n[0] === 'p')
        .some((n) => /Сирена|Кран воды|Сигнализац/.test(JSON.stringify(labelsOf(n)))));
must('действий найдено больше 20', diag.index.actions > 20);
// Без этой проверки сломанное чтение значений проходит незамеченным:
// /status печатается, но никто не смотрит, что внутри.
must('/status показывает фактические показания, а не прочерки',
    /24\.8/.test(statusText) && statusText.indexOf('—') === -1);
must('скрытое через OVERRIDES в меню не попало',
    !Object.keys(settings.buttonSets)
        .some((n) => /Самоочистка/.test(JSON.stringify(labelsOf(n)))));
// Автозапуск — отдельный блочный сценарий, и он ссылается на имена ботов
// строками. Рассинхрон с bots ловится только так: в хабе он проявился как
// «Bot botName1 not found» и молчащий бот.
const autostart = fs.readFileSync(
    path.join(ROOT, 'src', '04-autostart.code.1.js'), 'utf8')
    // Комментарии выкидываем: упоминание имени в пояснении — не вызов.
    // Первая версия проверки поймала ровно такое упоминание и дала ложный отказ.
    .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const referenced = [...autostart.matchAll(/startPolling\(\s*'([^']+)'\s*\)/g)]
    .map((m) => m[1]);
must('автозапуск не ссылается на несуществующих ботов: '
     + (referenced.length ? referenced.join(', ') : 'жёстких имён нет'),
    referenced.every((name) => Object.prototype.hasOwnProperty.call(settings.bots, name)));
must('хотя бы у одного бота включён autoStart',
    Object.keys(settings.bots).some((k) => settings.bots[k] && settings.bots[k].autoStart));
// Устойчивость идентификаторов: имя набора строится из aId/cId и хеша имени
// комнаты. Проверяем не форму строки, а свойство — что при другом порядке
// комнат имена наборов те же.
// Устойчивость проверяем свойством, а не формой строки: собираем те же
// настройки на хабе с перевёрнутым порядком комнат и сверяем имена наборов.
// При индексных именах они бы разъехались.
const reorderedNames = (() => {
    const shuffled = JSON.parse(JSON.stringify(fixture));
    shuffled.rooms.reverse();
    const box = Object.assign({}, sandbox);
    const rooms2 = makeRooms(shuffled);
    box.Hub = Object.assign({}, Hub, { getRooms: () => rooms2 });
    vm.createContext(box);
    box.global = { LoggerFactory: sandbox.global.LoggerFactory, TGActions };
    vm.runInContext(code, box, { filename: 'settings.reordered.js' });
    return Object.keys(box.TGActionsSettings.buttonSets).sort();
})();
must('имена наборов не зависят от порядка комнат',
    JSON.stringify(reorderedNames) === JSON.stringify(setNames.slice().sort()));
must('набор устройства адресуется по aId',
    setNames.some((n) => n === 'fd39' || n === 'pd39'));
must('набор действия адресуется по aId и cId',
    setNames.some((n) => n === 'fa39_15' || n === 'pa39_15'));
// Переименование в хабе и /refresh. Заглушка Hub читает имя из объекта
// фикстуры через замыкание, поэтому правка объекта = переименование в хабе.
// Без этой проверки механизм /refresh остаётся непроверенным, а он —
// единственный способ подхватить переименование без перезагрузки сценария.
const renamed = (() => {
    const room = fixture.rooms.find((r) => r.name === 'Гостиная');
    const acc = room.accessories.find((a) => a.aId === 8);
    const svc = acc.services.find((s) => s.sId === 13);
    const before = svc.name;
    svc.name = 'Температура гостиная НОВОЕ ИМЯ';
    cmd('refresh', PRIVATE_CHAT, OWNER);
    cmd('status', PRIVATE_CHAT, OWNER);
    const after = trace.sent[trace.sent.length - 1].text;
    svc.name = before;
    return { before, after };
})();
// Порядок внутри меню: обход хаба произволен, поэтому и устройства в комнате,
// и действия в устройстве должны сортироваться. Проверяем ТОЛЬКО навигационные
// наборы: в наборах значений («Выкл», «Тепло», «Холод») порядок осмысленный и
// сортировать их нельзя — первая версия проверки этого не различала и падала.
//   <профиль>r<хеш> — кнопки = имена устройств комнаты
//   <профиль>d<aId> — кнопки = названия действий устройства
function sortedAscending(list) {
    for (let i = 1; i < list.length; i++) {
        if (list[i - 1] > list[i]) return false;
    }
    return true;
}
const navSets = Object.keys(settings.buttonSets).filter((n) => /^[fp][rd]/.test(n));
const unsorted = navSets.filter((n) => {
    const labels = labelsOf(n).map((row) => row[0]).filter((s) => s !== BACK_LABEL);
    return !sortedAscending(labels);
});
must('устройства и действия в меню отсортированы (наборов: ' + navSets.length + ')',
    unsorted.length === 0);
must('/refresh подхватывает переименование из хаба',
    renamed.after.includes('Температура гостиная НОВОЕ ИМЯ'));
must('стенд не спотыкался', trace.errors.length === 0);
say('');

if (failures.length) {
    say('ПРОВАЛЕНО ' + failures.length + ':');
    failures.forEach((f) => say('  - ' + f));
} else {
    say('все проверки пройдены');
}

process.stdout.write(out.join('\n') + '\n');
process.exit(failures.length ? 1 : 0);
