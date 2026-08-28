   /*Блок запускается через 200 сек мосле старта хаба*/
 //   var _logger = global.LoggerFactory.create('TGActionsAutostart');
 //    _logger.info('Telegram for Sprut. Part 3. Auto start bot');
    var startDelay = 10; // 30 секунд
 //   _logger.info('init: scheduling auto-start of all bots in {} ms', startDelay);
    
    // Порядок загрузки глобальных сценариев хаб не гарантирует, а при
    // переустановке настроек они на минуту исчезают совсем. Без проверки
    // обращение к .bots бросает TypeError, и бот не стартует вообще —
    // так уже было. Поэтому ждём появления настроек и пробуем повторно.
    var attempt = 0;
    function startAll() {
        attempt = attempt + 1;
        if (!global.TGActionsSettings || !global.TGActionsSettings.bots
                || !global.TGActions) {
            if (attempt < 10) {
                setTimeout(startAll, 15000);
            }
            return;
        }
        for (var botName in global.TGActionsSettings.bots) {
//             _logger.info('1');
            if (!global.TGActionsSettings.bots.hasOwnProperty(botName)) continue;
            var config = global.TGActionsSettings.bots[botName];
            if (config && config.autoStart) {
//                    _logger.info('init: auto-starting {}', botName);
                    global.TGActions.startPolling(botName);
            }
        }
    }

    setTimeout(startAll, startDelay);
    
    