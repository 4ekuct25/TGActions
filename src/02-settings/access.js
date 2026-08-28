/**
 * Кто и чем может управлять.
 *
 * Правится руками — это единственное место, где задаётся политика доступа.
 * Ссылаемся на комнаты по ИМЕНАМ, а не по числовым id: при перепаривании
 * устройства id в хабе меняется, имя комнаты — нет.
 *
 * Здесь лежит СТРУКТУРА политики, но не сами id: chatId и белый список людей
 * подставляются из неотслеживаемого local.js (см. local.example.js).
 * Репозиторий публичный, поэтому в отслеживаемых файлах только плейсхолдеры.
 *
 * Зависимости: local (может отсутствовать — тогда останутся плейсхолдеры).
 */
function TGActionsAccess(ns) {
    var local = ns && ns.local ? ns.local : null;

    // ─────────────────────────────  Профили чатов  ─────────────────────────
    // key       — короткий идентификатор, попадает в имена наборов кнопок
    // chatId    — id чата в Telegram; у групп он отрицательный
    // rooms     — какие комнаты видны в этом чате; '*' — все
    // allowCritical — можно ли в этом чате трогать критичное вообще
    var profiles = [
        {
            key: 'f',
            title: 'Семейный чат',
            chatId: 'Заполнить',
            rooms: ['Гостиная', 'Кухня', 'Детские комнаты', 'Кабинет', 'Улица'],
            allowCritical: false
        },
        {
            key: 'p',
            title: 'Личные сообщения',
            chatId: 'Заполнить',
            rooms: ['*'],
            allowCritical: true
        }
    ];

    // ────────────────────────────  Белый список людей  ─────────────────────
    // Ключ — user_id в Telegram (строкой). Узнать свой: команда /who.
    // critical: true — человеку разрешены критичные действия там, где их
    // разрешает профиль чата.
    var users = {
        'Заполнить': { name: 'Хозяин', critical: true }
    };

    // Автор не из списка: 'ignore' — молча не реагировать, 'deny' — ответить отказом.
    var strangerPolicy = 'deny';

    // Подстановка реальных значений из local.js. Профиль без chatId остаётся
    // с плейсхолдером и просто ни с одним чатом не совпадёт — это безопасный
    // отказ, а не тихое разрешение.
    if (local) {
        if (local.chats) {
            for (var i = 0; i < profiles.length; i++) {
                if (local.chats[profiles[i].key]) {
                    profiles[i].chatId = local.chats[profiles[i].key];
                }
            }
        }
        if (local.users) {
            users = local.users;
        }
    }

    function profileByChat(chatId) {
        var id = String(chatId);
        for (var i = 0; i < profiles.length; i++) {
            if (String(profiles[i].chatId) === id) {
                return profiles[i];
            }
        }
        return null;
    }

    function roomAllowed(profile, roomName) {
        if (!profile) {
            return false;
        }
        for (var i = 0; i < profile.rooms.length; i++) {
            if (profile.rooms[i] === '*' || profile.rooms[i] === roomName) {
                return true;
            }
        }
        return false;
    }

    /**
     * Можно ли выполнить действие. Возвращает {ok, reason}.
     *
     * Действие разрешено, когда комната входит в профиль чата И (действие
     * не критичное ИЛИ и профиль, и человек допущены к критичному).
     * Неизвестный человек не проходит никогда — так же, как чужой чат
     * не проходит на уровне движка.
     */
    function check(chatId, userId, item) {
        var profile = profileByChat(chatId);
        if (!profile) {
            return { ok: false, reason: 'Этот чат не настроен для управления домом' };
        }
        var user = users[String(userId)];
        if (!user) {
            return {
                ok: false,
                silent: strangerPolicy === 'ignore',
                reason: 'Вас нет в списке разрешённых. Ваш id: ' + userId
            };
        }
        if (!roomAllowed(profile, item.room)) {
            return { ok: false, reason: 'Комната «' + item.room + '» недоступна в этом чате' };
        }
        if (item.critical && !(profile.allowCritical && user.critical)) {
            return { ok: false, reason: 'Действие «' + item.title + '» здесь запрещено' };
        }
        return { ok: true, user: user, profile: profile };
    }

    return {
        profiles: profiles,
        users: users,
        profileByChat: profileByChat,
        roomAllowed: roomAllowed,
        check: check
    };
}
