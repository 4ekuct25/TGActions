/**
 * Установка описания и короткого описания бота в Telegram.
 * Вызывается автоматически при первой регистрации команд.
 *
 * Зависимости: logger, constants, helpers.
 *
 * Значения по умолчанию (когда у бота в bots не заданы description /
 * shortDescription) берутся из настроек: TGActionsSettings.botDescription и
 * .botShortDescription. Раньше здесь стояли свободные глобальные
 * BOT_DESCRIPTION / BOT_SHORT_DESCRIPTION, нигде не объявленные, — на этой
 * ветке движок падал с ReferenceError.
 */
function TGActionsBotMeta(ns) {
    var _logger = ns.logger;
    var CONSTANTS = ns.constants.CONSTANTS;
    var getBot = ns.helpers.getBot;
    var buildApiUrl = ns.helpers.buildApiUrl;

    function setBotMeta(botName) {
        var bot = getBot(botName);
        var settings = global.TGActionsSettings;
        var description = bot.description || settings.botDescription;
        var shortDescription = bot.shortDescription || settings.botShortDescription;

        // Пустое значение не отправляем: Telegram трактует пустую строку как
        // «стереть описание», а это не то, чего хотел молчаливый конфиг.
        if (description) {
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
        } else {
            _logger.warn('setBotMeta: description for {} not set anywhere, skipped', botName);
        }

        if (shortDescription) {
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
        } else {
            _logger.warn('setBotMeta: short description for {} not set anywhere, skipped', botName);
        }
    }

    return {
        setBotMeta: setBotMeta
    };
}
