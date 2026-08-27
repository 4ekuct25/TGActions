/**
 * Установка описания и короткого описания бота в Telegram.
 * Вызывается автоматически при первой регистрации команд.
 *
 * Зависимости: logger, constants, helpers.
 *
 * ВНИМАНИЕ: BOT_DESCRIPTION и BOT_SHORT_DESCRIPTION — свободные глобальные
 * переменные, в репозитории они нигде не объявлены. Ветка с ними сработает
 * только если её кто-то определит снаружи; иначе будет ReferenceError.
 * Перенесено из исходного движка как есть.
 */
function TGActionsBotMeta(ns) {
    var _logger = ns.logger;
    var CONSTANTS = ns.constants.CONSTANTS;
    var getBot = ns.helpers.getBot;
    var buildApiUrl = ns.helpers.buildApiUrl;

    function setBotMeta(botName) {
        var bot = getBot(botName);
        var description = bot.description || BOT_DESCRIPTION;
        var shortDescription = bot.shortDescription || BOT_SHORT_DESCRIPTION;
        try {
            var urlD = buildApiUrl(bot.key, CONSTANTS.SET_DESCRIPTION_ENDPOINT);
            var respD = HttpClient.POST(urlD).queryString('description', description).send();
            if (respD.getStatus() === 200) {
                _logger.info('Description set for {}', botName);
            } else {
                _logger.error('setBotMeta description {} – status {}', botName, respD.getStatus());
            }
        } catch (e) {
            _logger.error('setBotMeta description exception: {}', e);
        }
        try {
            var urlSD = buildApiUrl(bot.key, CONSTANTS.SET_SHORT_DESCRIPTION_ENDPOINT);
            var respSD = HttpClient.POST(urlSD).queryString('short_description', shortDescription).send();
            if (respSD.getStatus() === 200) {
                _logger.info('Short description set for {}', botName);
            } else {
                _logger.error('setBotMeta short description {} – status {}', botName, respSD.getStatus());
            }
        } catch (e) {
            _logger.error('setBotMeta short description exception: {}', e);
        }
    }

    return {
        setBotMeta: setBotMeta
    };
}
