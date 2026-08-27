/**
 * Сборка модулей и публичный API TGActions.
 *
 * Порядок создания = порядок зависимостей: модуль получает ns уже с теми
 * ветками, на которые он ссылается. Менять порядок нельзя.
 */
function TGActionsIndex() {
    var ns = {};

    ns.constants = TGActionsConstants();
    ns.logger = TGActionsLogger();
    ns.state = TGActionsState();
    ns.helpers = TGActionsHelpers(ns);
    ns.messaging = TGActionsMessaging(ns);
    ns.botMeta = TGActionsBotMeta(ns);
    ns.commands = TGActionsCommands(ns);
    ns.handlers = TGActionsHandlers(ns);
    ns.updates = TGActionsUpdates(ns);
    ns.polling = TGActionsPolling(ns);

    // Аналог прежнего init(): логгер создаётся до возврата публичного API.
    ns.logger.init(ns.constants.ver);

    return {
        sendSimpleMessage: ns.messaging.sendSimpleMessage,
        sendInteractiveMessage: ns.messaging.sendInteractiveMessage,
        sendReplyKeyboard: ns.messaging.sendReplyKeyboard,
        removeReplyKeyboard: ns.messaging.removeReplyKeyboard,
        registerReplyKeyboardSet: ns.messaging.registerReplyKeyboardSet,
        startPolling: ns.polling.startPolling,
        stopPolling: ns.polling.stopPolling,
        rebootPolling: ns.polling.rebootPolling
    };
}
