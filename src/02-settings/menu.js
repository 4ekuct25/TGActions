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
 * Зависимости: access, discovery.
 */
function TGActionsMenu(ns) {
    var access = ns.access;
    var discovery = ns.discovery;

    var BACK = '‹ Назад';

    function send(cq, text) {
        global.TGActions.sendSimpleMessage(cq.botName, String(cq.message.chat.id), text);
    }

    function open(cq, setName, text) {
        global.TGActions.sendInteractiveMessage(
            cq.botName, String(cq.message.chat.id), setName, text, { notify: false });
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
                    send(cq, '⚠️ Не удалось: ' + e);
                    return;
                }
                // Подтверждаем намерение, а не результат: значение в хабе
                // доезжает асинхронно, и немедленное чтение врёт.
                send(cq, '✅ ' + item.room + ' · ' + item.title + ' → ' + label);
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

                var roomSet = profile.key + 'r' + r;
                var deviceRows = [];

                for (var d = 0; d < devices.order.length; d++) {
                    var deviceName = devices.order[d];
                    var items = devices.map[deviceName];
                    var deviceSet = profile.key + 'd' + r + '_' + d;
                    var actionRows = [];

                    for (var i = 0; i < items.length; i++) {
                        var actionSet = profile.key + 'a' + r + '_' + d + '_' + i;
                        buttonSets[actionSet] = actionButtons(items[i], deviceSet);
                        actionRows.push([navButton(actionSet, items[i].title)]);
                        index.actions++;
                    }
                    actionRows.push([navButton(roomSet, BACK)]);
                    buttonSets[deviceSet] = actionRows;
                    deviceRows.push([navButton(deviceSet, deviceName)]);
                    index.devices++;
                }

                deviceRows.push([navButton(profile.key + 'h', BACK)]);
                buttonSets[roomSet] = deviceRows;
                homeRows.push([navButton(roomSet, roomName)]);
                index.rooms++;
            }

            buttonSets[profile.key + 'h'] = homeRows.length
                ? homeRows
                : [[{ text: 'Нет доступных устройств', handler: function () {} }]];
            homeOf[String(profile.chatId)] = profile.key + 'h';
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
        return { map: map, order: order };
    }

    return {
        build: build,
        valueLabel: valueLabel
    };
}
