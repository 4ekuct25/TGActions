/**
 * Обход хаба: строит список доступных действий и датчиков.
 *
 * Список устройств нигде не хранится — он каждый раз собирается из хаба.
 * Поэтому новое устройство появляется в меню после /refresh, переименование
 * подхватывается, а перепаривание не оставляет ссылок в никуда.
 *
 * Чтение из глобального сценария разрешено — проверено спайком в живом хабе
 * (см. JOURNAL.md, запись от 2026-08-28). Запись — нет, поэтому пишем только
 * из обработчиков кнопок, которые вызываются по цепочке от блочного сценария.
 *
 * Зависимости: actions, visibility.
 */
function TGActionsDiscovery(ns) {
    var rules = ns.actions;
    var hidden = ns.visibility;

    /**
     * UUID характеристики в хабе имеет вид 'aId.sId.cId'. Числовой пары
     * (aId, cId) нет в объектной модели сценариев, а Hub.setCharacteristicValue
     * принимает именно её — единственный вызов записи, проверенный на живом хабе.
     */
    function addressOf(characteristic) {
        var uuid;
        try {
            uuid = String(characteristic.getUUID());
        } catch (e) {
            return null;
        }
        var parts = uuid.split('.');
        if (parts.length < 3) {
            return null;
        }
        var aId = parseInt(parts[0], 10);
        var cId = parseInt(parts[2], 10);
        if (isNaN(aId) || isNaN(cId)) {
            return null;
        }
        return { aId: aId, cId: cId, key: aId + ',' + cId };
    }

    /** Набор значений для kind: 'range' — из правила либо из границ характеристики. */
    function rangeSteps(rule, characteristic) {
        if (rule.steps) {
            return rule.steps;
        }
        var min = characteristic.getMinValue();
        var max = characteristic.getMaxValue();
        if (min === null || max === null || min === undefined || max === undefined || max <= min) {
            return null;
        }
        var count = rule.points || 5;
        var out = [];
        var step = (max - min) / (count - 1);
        for (var i = 0; i < count; i++) {
            out.push(Math.round(min + step * i));
        }
        return out;
    }

    function describe(characteristic, accessory, service, roomName) {
        var type = String(characteristic.getType());
        var addr = addressOf(characteristic);
        if (!addr) {
            return null;
        }

        var override = rules.OVERRIDES[addr.key] || {};
        if (override.hide) {
            return null;
        }

        // Имя сервиса обычно осмысленнее имени характеристики: «Свет Даша»
        // против «Включен». Имя аксессуара берём, только если сервис безымянный.
        var title = override.title
            || String(service.getName() || accessory.getName() || type);

        var base = {
            key: addr.key,
            aId: addr.aId,
            cId: addr.cId,
            room: roomName,
            device: String(accessory.getName()),
            title: title,
            // Имя самой характеристики («Яркость», «Цветовая температура»).
            // Нужно, когда у устройства несколько характеристик в ОДНОМ
            // сервисе: тогда title у них общий и различить их нечем.
            charName: String(characteristic.getName() || ''),
            type: type
        };

        var rule = rules.ACTIONS[type];
        if (rule) {
            base.kind = rule.kind;
            base.critical = override.critical !== undefined ? override.critical : !!rule.critical;
            base.on = rule.on !== undefined ? rule.on : true;
            base.off = rule.off !== undefined ? rule.off : false;
            base.unit = rule.unit || '';
            base.labels = rule.labels || null;
            if (rule.kind === 'range') {
                base.steps = rangeSteps(rule, characteristic);
                if (!base.steps) {
                    return null;
                }
            }
            return base;
        }

        var ro = rules.READONLY[type];
        if (ro) {
            base.kind = 'readonly';
            base.unit = ro.unit || '';
            base.labels = ro.labels || null;
            return base;
        }

        return null;
    }

    /**
     * @returns {{actions: Array, sensors: Array, rooms: Array, errors: Array}}
     */
    function scan() {
        var actions = [];
        var sensors = [];
        var roomNames = [];
        var errors = [];

        var rooms;
        try {
            rooms = Hub.getRooms();
        } catch (e) {
            return { actions: [], sensors: [], rooms: [], errors: ['getRooms: ' + e] };
        }

        for (var r = 0; r < rooms.length; r++) {
            var roomName;
            try {
                roomName = String(rooms[r].getName());
            } catch (e) {
                errors.push('room ' + r + ': ' + e);
                continue;
            }
            // Комната в чёрном списке — пропускаем целиком: ни меню, ни
            // /status её не увидят.
            if (hidden.isRoomHidden(roomName)) {
                continue;
            }
            var accs;
            try {
                accs = rooms[r].getAccessories();
            } catch (e) {
                errors.push(roomName + ': ' + e);
                continue;
            }
            var roomHasSomething = false;

            for (var a = 0; a < accs.length; a++) {
                if (hidden.isAccessoryHidden(String(accs[a].getName()))) {
                    continue;
                }
                var services;
                try {
                    services = accs[a].getServices(true);
                } catch (e) {
                    errors.push(roomName + '/' + a + ': ' + e);
                    continue;
                }
                for (var s = 0; s < services.length; s++) {
                    var chars;
                    try {
                        chars = services[s].getCharacteristics();
                    } catch (e) {
                        continue;
                    }
                    for (var c = 0; c < chars.length; c++) {
                        var item;
                        try {
                            item = describe(chars[c], accs[a], services[s], roomName);
                        } catch (e) {
                            continue;
                        }
                        if (!item) {
                            continue;
                        }
                        roomHasSomething = true;
                        if (item.kind === 'readonly') {
                            sensors.push(item);
                        } else {
                            actions.push(item);
                        }
                    }
                }
            }

            if (roomHasSomething) {
                roomNames.push(roomName);
            }
        }

        // Порядок обхода Hub.getRooms() произволен, поэтому сортируем явно.
        return {
            actions: actions,
            sensors: sensors,
            rooms: hidden.sortNames(roomNames),
            errors: errors
        };
    }

    /** Текущее значение — читаем в момент показа, не кэшируем. */
    function readValue(item) {
        try {
            return Hub.getCharacteristicValue(item.aId, item.cId);
        } catch (e) {
            return null;
        }
    }

    /**
     * Запись. Проверять результат немедленным чтением НЕЛЬЗЯ: значение
     * доезжает асинхронно, и сразу после записи хаб отдаёт старое —
     * на этом уже был сделан неверный вывод (см. JOURNAL.md).
     */
    function writeValue(item, value) {
        Hub.setCharacteristicValue(item.aId, item.cId, value);
    }

    return {
        scan: scan,
        readValue: readValue,
        writeValue: writeValue,
        addressOf: addressOf
    };
}
