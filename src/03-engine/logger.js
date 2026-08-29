/**
 * Логирование движка. Пишет напрямую в `log` — глобальный объект хаба.
 *
 * Раньше здесь вызывался `global.LoggerFactory.create(...)` из отдельного
 * глобального сценария Logger. Это давало лишний сценарий и лишнюю точку
 * отказа: порядок загрузки глобальных сценариев хаб не гарантирует, и если
 * Logger не успел объявиться (или его удалили), движок падал на инициализации.
 *
 * Формат строки воспроизводит прежний ДОСЛОВНО — «Info: TGActions#0.5.2#…,
 * текст». Иначе разъехались бы и привычный вид журнала, и все прежние замеры.
 * Отсюда же и подстановка `{}` по тем же правилам: лишние аргументы
 * отбрасываются, недостающие оставляют `{}` на месте.
 *
 * debug по умолчанию выключен, как и прежде.
 *
 * Зависимостей нет.
 */
function TGActionsLogger() {
    var name = null;
    var debugEnabled = false;

    /** 'Инфо: {} и {}' + [1] → 'Инфо: 1 и {}'. Правила прежнего Logger. */
    function render(args) {
        if (args.length === 0) {
            return '';
        }
        var format = String(args[0]);
        var rest = Array.prototype.slice.call(args, 1);
        if (rest.length === 0) {
            return format;
        }
        var parts = format.split('{}');
        var out = '';
        for (var i = 0; i < parts.length - 1; i++) {
            out += parts[i];
            out += (i < rest.length) ? rest[i] : '{}';
        }
        return out + parts[parts.length - 1];
    }

    function line(level, args) {
        return level + ': ' + name + ', ' + render(args);
    }

    /**
     * До init() имя ещё не известно, поэтому молчим — как и прежняя обёртка,
     * которая до init не имела экземпляра логгера.
     */
    function emit(level, method, args) {
        if (name === null) {
            return;
        }
        try {
            log[method](line(level, args));
        } catch (e) {
            // Логирование не должно ронять опрос: если log недоступен,
            // сообщение теряется, но бот продолжает работать.
        }
    }

    return {
        init: function (ver) {
            name = 'TGActions' + ver;
        },
        info: function () {
            emit('Info', 'info', arguments);
        },
        warn: function () {
            emit('Warn', 'warn', arguments);
        },
        error: function () {
            emit('Error', 'error', arguments);
        },
        debug: function () {
            if (debugEnabled) {
                emit('Debug', 'info', arguments);
            }
        },
        setDebugEnabled: function (value) {
            debugEnabled = !!value;
        }
    };
}
