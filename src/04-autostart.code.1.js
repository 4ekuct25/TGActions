   /*Блок запускается через 200 сек мосле старта хаба*/
 //   var _logger = global.LoggerFactory.create('TGActionsAutostart');
 //    _logger.info('Telegram for Sprut. Part 3. Auto start bot');
    var startDelay = 10; // 30 секунд
 //   _logger.info('init: scheduling auto-start of all bots in {} ms', startDelay);
    
    setTimeout(function() {
        // Здесь раньше стоял жёсткий startPolling('botName1'). При
        // переименовании бота строка выбрасывала исключение ДО цикла
        // ниже, и не стартовал никто. Цикл делает то же самое и сам.
        for (var botName in global.TGActionsSettings.bots) {
//             _logger.info('1');
            if (!global.TGActionsSettings.bots.hasOwnProperty(botName)) continue;
            var config = global.TGActionsSettings.bots[botName];
            if (config && config.autoStart) {
//                    _logger.info('init: auto-starting {}', botName);
                    global.TGActions.startPolling(botName);
            }
        }
    }, startDelay);
    
    