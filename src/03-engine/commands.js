/**
 * Регистрация команд бота (botCommands) в Telegram.
 *
 * Зависимости: logger, helpers, state, botMeta.
 */
function TGActionsCommands(ns) {
    var _logger = ns.logger;
    var getBot = ns.helpers.getBot;
    var buildApiUrl = ns.helpers.buildApiUrl;
    var commandsRegistered = ns.state.commandsRegistered;
    var setBotMeta = ns.botMeta.setBotMeta;

    /**
     * Регистрирует все команды (botCommands) в Telegram и устанавливает метаданные.
     */
    function registerBotCommands(botName) {
        if (commandsRegistered[botName]) {
            return;
        }
        var bot = getBot(botName);
        var url = buildApiUrl(bot.key, '/setMyCommands');
        var cmdArray = Object.keys(global.TGActionsSettings.botCommands).map(function (name) {
            return { command: name, description: global.TGActionsSettings.botCommands[name].description || '' };
        });
        try {
            var resp = HttpClient.POST(url).header('Content-Type', 'application/json').body(JSON.stringify({ commands: cmdArray })).send();
            if (resp.getStatus() === 200) {
                commandsRegistered[botName] = true;
                _logger.info('Registered {} commands for {}', cmdArray.length, botName);
                setBotMeta(botName);
            } else {
                _logger.error('registerBotCommands {} – status {}', botName, resp.getStatus());
            }
        } catch (e) {
            _logger.error('registerBotCommands exception: {}', e);
        }
    }

    return {
        registerBotCommands: registerBotCommands
    };
}
