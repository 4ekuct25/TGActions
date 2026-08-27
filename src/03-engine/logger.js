/**
 * Обёртка над global.LoggerFactory.
 *
 * Реальный логгер создаётся не при сборке модулей, а в init() — как и в
 * исходном движке, где _logger объявлялся пустым и заполнялся в init().
 * До init() вызовы info/warn/error молча игнорируются.
 *
 * Зависимостей нет.
 */
function TGActionsLogger() {
    var impl = null;

    function forward(level) {
        return function () {
            if (!impl) {
                return;
            }
            impl[level].apply(impl, arguments);
        };
    }

    return {
        init: function (ver) {
            impl = global.LoggerFactory.create('TGActions' + ver);
        },
        info: forward('info'),
        warn: forward('warn'),
        error: forward('error')
    };
}
