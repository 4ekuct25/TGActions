/**
 * Команды бота.
 *
 * Зависимости: access, discovery, menu, state.
 */
function TGActionsCommands(ns) {
    var access = ns.access;
    var discovery = ns.discovery;
    var menu = ns.menu;
    var state = ns.menuState;

    function reply(ctx, text) {
        global.TGActions.sendSimpleMessage(ctx.botName, String(ctx.chatId), text);
    }

    // localeCompare в Nashorn поведение не гарантирует, поэтому сравниваем
    // напрямую: для одного алфавита порядок кодовых точек — это алфавит.
    function byTitle(a, b) {
        if (a.title === b.title) {
            return 0;
        }
        return a.title < b.title ? -1 : 1;
    }

    /** Общий вход: чат настроен и человек известен. */
    function gate(ctx) {
        var profile = access.profileByChat(ctx.chatId);
        if (!profile) {
            reply(ctx, '⛔ Этот чат не настроен для управления домом.\nchat_id: ' + ctx.chatId);
            return null;
        }
        if (!access.users[String(ctx.userId)]) {
            reply(ctx, '⛔ Вас нет в списке разрешённых.\nВаш id: ' + ctx.userId);
            return null;
        }
        return profile;
    }

    var commands = {
        home: {
            description: 'Меню управления домом',
            handler: function (ctx) {
                var profile = gate(ctx);
                if (!profile) {
                    return;
                }
                global.TGActions.sendInteractiveMessage(
                    ctx.botName, String(ctx.chatId), profile.key + 'h',
                    'Дом. Выберите комнату:', { notify: false });
            }
        },

        status: {
            description: 'Показания датчиков',
            handler: function (ctx) {
                var profile = gate(ctx);
                if (!profile) {
                    return;
                }
                // Раскладываем по комнатам, а не идём по плоскому списку:
                // порядок комнат берётся из rooms.js (порядок хаба), датчики
                // внутри комнаты сортируются по имени. Порядок обхода хаба
                // не годится ни для того, ни для другого.
                var byRoom = {};
                var sensors = state.inventory.sensors;
                var i;
                for (i = 0; i < sensors.length; i++) {
                    var s = sensors[i];
                    if (!byRoom[s.room]) {
                        byRoom[s.room] = [];
                    }
                    byRoom[s.room].push(s);
                }

                var lines = [];
                var rooms = state.inventory.rooms;
                for (i = 0; i < rooms.length; i++) {
                    var room = rooms[i];
                    if (!access.roomAllowed(profile, room) || !byRoom[room]) {
                        continue;
                    }
                    var list = byRoom[room].slice().sort(byTitle);
                    lines.push('');
                    lines.push('*' + room + '*');
                    for (var j = 0; j < list.length; j++) {
                        lines.push(list[j].title + ': '
                            + menu.valueLabel(list[j], discovery.readValue(list[j])));
                    }
                }
                reply(ctx, lines.length ? lines.join('\n') : 'Датчиков в доступных комнатах нет');
            }
        },

        who: {
            description: 'Кто я для бота',
            handler: function (ctx) {
                var profile = access.profileByChat(ctx.chatId);
                var user = access.users[String(ctx.userId)];
                reply(ctx, [
                    'Ваш user_id: ' + ctx.userId,
                    'Имя: ' + (ctx.userName || '—'),
                    'chat_id: ' + ctx.chatId,
                    'Профиль чата: ' + (profile ? profile.title : 'не настроен'),
                    'В белом списке: ' + (user ? 'да' : 'нет'),
                    'Критичные действия: ' + (user && user.critical && profile && profile.allowCritical
                        ? 'разрешены' : 'запрещены')
                ].join('\n'));
            }
        },

        refresh: {
            description: 'Перечитать устройства из хаба',
            handler: function (ctx) {
                if (!gate(ctx)) {
                    return;
                }
                var result = state.refresh();
                reply(ctx, [
                    'Обход хаба выполнен.',
                    'Комнат: ' + result.inventory.rooms.length,
                    'Действий: ' + result.index.actions,
                    'Датчиков: ' + result.inventory.sensors.length,
                    result.inventory.errors.length
                        ? 'Ошибок обхода: ' + result.inventory.errors.length
                        : 'Ошибок нет'
                ].join('\n'));
            }
        },

        help: {
            description: 'Список команд',
            handler: function (ctx) {
                var lines = [];
                for (var name in commands) {
                    if (commands.hasOwnProperty(name)) {
                        lines.push('/' + name + ' — ' + commands[name].description);
                    }
                }
                reply(ctx, lines.join('\n'));
            }
        }
    };

    return commands;
}
