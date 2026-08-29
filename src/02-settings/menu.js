/**
 * Меню: строится из результата обхода хаба, не пишется руками.
 *
 * Три уровня inline-кнопок: комната → устройство → действие. Inline, а не
 * reply-клавиатура: в группе бот по умолчанию не видит обычный текст
 * (Privacy Mode), а callback_query приходит всегда.
 *
 * Наборы кнопок строятся отдельно для каждого профиля чата — так в семейном
 * чате физически нет кнопок, которых там быть не должно, и фильтровать при
 * отправке не требуется.
 *
 * Имена наборов короткие намеренно: они уезжают в callback_data, у которого
 * лимит 64 байта, а кириллица там стоит два байта на символ.
 *
 * Зависимости: access, discovery, visibility.
 */
function TGActionsMenu(ns) {
    var access = ns.access;
    var discovery = ns.discovery;
    var sortNames = ns.visibility.sortNames;

    var BACK = '‹ Назад';

    /**
     * Имена наборов кнопок строятся из устойчивых признаков самой сущности,
     * а не из её позиции в списке.
     *
     * Раньше в имени сидели индексы комнаты и устройства, и любая перестановка
     * (добавили комнату, переименовали, сменили порядок) делала кнопки в уже
     * отправленных сообщениях указывающими не туда. Теперь: комната — хеш
     * имени, устройство — aId, действие — aId с cId. Эти значения меняются
     * только вместе с самим устройством.
     *
     * Что осталось неустойчивым: позиция кнопки ВНУТРИ набора (движок адресует
     * её как r:c). Если у комнаты изменится состав устройств, старая кнопка в
     * истории чата может попасть в соседнее. Лечится повторным /home; чинить
     * полностью — значит менять формат callback_data в движке.
     */
    function hashName(name) {
        var h = 5381;
        for (var i = 0; i < name.length; i++) {
            h = ((h * 33) ^ name.charCodeAt(i)) >>> 0;
        }
        return h.toString(36);
    }

    function homeSet(profile) {
        return profile.key + 'h';
    }

    function roomSet(profile, roomName) {
        return profile.key + 'r' + hashName(roomName);
    }

    function deviceSet(profile, item) {
        return profile.key + 'd' + item.aId;
    }

    function actionSet(profile, item) {
        return profile.key + 'a' + item.aId + '_' + item.cId;
    }

    function send(cq, text) {
        global.TGActions.sendSimpleMessage(cq.botName, String(cq.message.chat.id), text);
    }

    function open(cq, setName, text) {
        global.TGActions.sendInteractiveMessage(
            cq.botName, String(cq.message.chat.id), setName, text, { notify: false });
    }

    /**
     * Человекочитаемый путь до действия: комната · устройство · действие.
     *
     * Устройство добавляется, только если его имя отличается от названия
     * действия: у многих устройств сервис назван так же, и вышло бы
     * «Лампа над столом левая · Лампа над столом левая».
     */
    function itemPath(item) {
        if (item.title === item.device) {
            return item.room + ' · ' + item.title;
        }
        return item.room + ' · ' + item.device + ' · ' + item.title;
    }

    function valueLabel(item, value) {
        if (item.labels) {
            var byLabel = item.labels[String(value)];
            if (byLabel) {
                return byLabel;
            }
        }
        if (item.kind === 'switch') {
            return value === item.on ? 'включено' : 'выключено';
        }
        if (value === null || value === undefined) {
            return '—';
        }
        return String(value) + (item.unit ? ' ' + item.unit : '');
    }

    /** Кнопки конкретного действия: Вкл/Выкл, набор значений либо перечисление. */
    function actionButtons(item, backSet) {
        var row = [];
        var i;

        if (item.kind === 'switch') {
            row.push(valueButton(item, item.on, 'Включить'));
            row.push(valueButton(item, item.off, 'Выключить'));
        } else if (item.kind === 'range') {
            for (i = 0; i < item.steps.length; i++) {
                row.push(valueButton(item, item.steps[i],
                    String(item.steps[i]) + (item.unit ? ' ' + item.unit : '')));
            }
        } else if (item.kind === 'choice') {
            for (var k in item.labels) {
                if (item.labels.hasOwnProperty(k)) {
                    row.push(valueButton(item, parseInt(k, 10), item.labels[k]));
                }
            }
        }

        var rows = [];
        // По три кнопки в ряд: длинные ряды в Telegram сжимаются в нечитаемое.
        for (i = 0; i < row.length; i += 3) {
            rows.push(row.slice(i, i + 3));
        }
        rows.push([navButton(backSet, BACK)]);
        return rows;
    }

    function valueButton(item, value, label) {
        return {
            text: label,
            handler: function (cq) {
                var verdict = access.check(cq.message.chat.id, cq.userId, item);
                if (!verdict.ok) {
                    if (!verdict.silent) {
                        send(cq, '⛔ ' + verdict.reason);
                    }
                    return;
                }
                try {
                    discovery.writeValue(item, value);
                } catch (e) {
                    send(cq, '⚠️ ' + itemPath(item) + ' — не удалось: ' + e);
                    return;
                }
                // Подтверждаем намерение, а не результат: значение в хабе
                // доезжает асинхронно, и немедленное чтение врёт.
                send(cq, '✅ ' + itemPath(item) + ' → ' + label);
            }
        };
    }

    /** Короткая форма значения для подписи кнопки: место в кнопке дорого. */
    function shortValue(item, value) {
        if (item.labels) {
            var byLabel = item.labels[String(value)];
            if (byLabel) {
                return byLabel;
            }
        }
        if (item.kind === 'switch') {
            return value === item.on ? 'вкл' : 'выкл';
        }
        return String(value) + (item.unit ? ' ' + item.unit : '');
    }

    /** Подпись «Название · текущее значение»; без значения — просто название. */
    function labelWithValue(item, name) {
        var value = discovery.readValue(item);
        if (value === null || value === undefined) {
            return name;
        }
        return name + ' · ' + shortValue(item, value);
    }

    /**
     * Кнопка перехода, показывающая текущее состояние устройства.
     *
     * text — ГЕТТЕР, и это существенно: меню строится один раз (при загрузке
     * сценария и по /refresh), а значения меняются постоянно. Движок читает
     * btn.text в момент отправки сообщения, поэтому значение вычисляется тогда
     * же и не успевает устареть. Подпись, вшитая при сборке, врала бы.
     */
    function stateButton(setName, item, name) {
        return {
            get text() {
                return labelWithValue(item, name);
            },
            handler: function (cq) {
                open(cq, setName, labelWithValue(item, name));
            }
        };
    }

    function navButton(setName, label) {
        return {
            text: label,
            handler: function (cq) {
                open(cq, setName, label === BACK ? 'Назад' : label);
            }
        };
    }

    /**
     * Собирает все наборы кнопок для всех профилей.
     * @returns {{buttonSets: Object, homeOf: Object, index: Object}}
     */
    function build(inventory) {
        var buttonSets = {};
        var homeOf = {};
        var index = { rooms: 0, devices: 0, actions: 0 };

        for (var p = 0; p < access.profiles.length; p++) {
            var profile = access.profiles[p];
            var homeRows = [];

            for (var r = 0; r < inventory.rooms.length; r++) {
                var roomName = inventory.rooms[r];
                if (!access.roomAllowed(profile, roomName)) {
                    continue;
                }

                var devices = groupByDevice(inventory.actions, roomName, profile);
                if (!devices.order.length) {
                    continue;
                }

                var rSet = roomSet(profile, roomName);
                var deviceRows = [];

                for (var d = 0; d < devices.order.length; d++) {
                    var deviceName = devices.order[d];
                    var items = devices.map[deviceName];
                    index.devices++;

                    // У устройства одно действие — промежуточный экран со
                    // списком из одной кнопки не нужен: из комнаты ведём сразу
                    // к значениям, а «Назад» оттуда — обратно в комнату.
                    if (items.length === 1) {
                        var only = actionSet(profile, items[0]);
                        buttonSets[only] = actionButtons(items[0], rSet);
                        deviceRows.push([stateButton(only, items[0], deviceName)]);
                        index.actions++;
                        continue;
                    }

                    var dSet = deviceSet(profile, items[0]);
                    var actionRows = [];
                    // Несколько характеристик одного сервиса дают одинаковый
                    // title («Лампа над столом левая» трижды). Такие — и только
                    // такие — подписываем именем характеристики, как в хабе.
                    // Заменять подписи у ВСЕГО устройства нельзя: у кондиционера
                    // осмысленные имена сервисов («Подсветка», «Самоочистка»)
                    // превратились бы в четыре одинаковых «Включен».
                    var display = displayNames(items);
                    // Пересортировать обязательно: groupByDevice сортировал по
                    // title, а у одноимённых он общий — на экране порядок
                    // оказался бы случайным.
                    items = items.slice().sort(function (a, b) {
                        var x = display[a.key];
                        var y = display[b.key];
                        return x === y ? 0 : (x < y ? -1 : 1);
                    });

                    for (var i = 0; i < items.length; i++) {
                        var aSet = actionSet(profile, items[i]);
                        buttonSets[aSet] = actionButtons(items[i], dSet);
                        actionRows.push([stateButton(aSet, items[i], display[items[i].key])]);
                        index.actions++;
                    }
                    actionRows.push([navButton(rSet, BACK)]);
                    buttonSets[dSet] = actionRows;
                    deviceRows.push([navButton(dSet, deviceName)]);
                }

                deviceRows.push([navButton(homeSet(profile), BACK)]);
                buttonSets[rSet] = deviceRows;
                homeRows.push([navButton(rSet, roomName)]);
                index.rooms++;
            }

            buttonSets[homeSet(profile)] = homeRows.length
                ? homeRows
                : [[{ text: 'Нет доступных устройств', handler: function () {} }]];
            homeOf[String(profile.chatId)] = homeSet(profile);
        }

        return { buttonSets: buttonSets, homeOf: homeOf, index: index };
    }

    /** Действия комнаты, сгруппированные по устройству, с сохранением порядка. */
    function groupByDevice(actions, roomName, profile) {
        var map = {};
        var order = [];
        for (var i = 0; i < actions.length; i++) {
            var item = actions[i];
            if (item.room !== roomName) {
                continue;
            }
            // Критичное не показываем там, где профиль его запрещает: кнопки,
            // которой нет, нельзя нажать по ошибке. Проверка в обработчике
            // при этом остаётся — она защищает от чужого человека в своём чате.
            if (item.critical && !profile.allowCritical) {
                continue;
            }
            if (!map[item.device]) {
                map[item.device] = [];
                order.push(item.device);
            }
            map[item.device].push(item);
        }

        // Порядок обхода хаба произволен, поэтому устройства сортируем.
        // Действия внутри устройства сортируются позже, в build, — по ТОМУ
        // имени, которое реально попадёт на кнопку. Сортировать их и здесь
        // по title означало бы два места, решающих один вопрос.
        return { map: map, order: sortNames(order) };
    }

    /**
     * Подписи действий устройства: 'aId,cId' -> что показать.
     *
     * Имя характеристики берётся только там, где title повторяется внутри
     * устройства. Уникальные имена сервисов сохраняются — они осмысленнее.
     */
    function displayNames(items) {
        var count = {};
        var i;
        for (i = 0; i < items.length; i++) {
            count[items[i].title] = (count[items[i].title] || 0) + 1;
        }
        var out = {};
        for (i = 0; i < items.length; i++) {
            out[items[i].key] = count[items[i].title] > 1
                ? (items[i].charName || items[i].title)
                : items[i].title;
        }
        return out;
    }

    return {
        build: build,
        valueLabel: valueLabel
    };
}
