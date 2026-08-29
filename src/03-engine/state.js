/**
 * Служебные состояния – где находимся в процессе опроса, id последнего
 * обновления и т.п. Не трогаем извне.
 *
 * Контейнеры отдаются наружу по ссылке: модули мутируют одни и те же объекты,
 * как это было внутри общей IIFE.
 *
 * Зависимостей нет (читает global.TGActionsSettings.chats при создании).
 */
function TGActionsState() {
    /**
     * Метка поколения движка.
     *
     * Таймеры переживают переустановку сценария: удалили сценарий движка и
     * залили новый — прежний экземпляр остаётся жить со своим циклом опроса.
     * В планировщике хаба это видно как задачи давно удалённых сценариев.
     * Несколько циклов дёргают getUpdates одного бота, Telegram допускает
     * только один — отсюда 409, самопроизвольные остановки и перехват
     * сообщения призраком со старым снимком настроек.
     *
     * Каждая загрузка увеличивает счётчик в global. Экземпляр, увидевший
     * чужое поколение, прекращает опрос сам.
     *
     * Если запись в global не пройдёт, счётчик останется undefined и все
     * экземпляры получат поколение 1 — станет как раньше, но не хуже.
     */
    var epoch;
    try {
        global.TGActionsEpoch = (global.TGActionsEpoch || 0) + 1;
        epoch = global.TGActionsEpoch;
    } catch (e) {
        epoch = 1;
    }

    function isCurrentEpoch() {
        return global.TGActionsEpoch === epoch;
    }

    var pollOffsets = {};   // last processed update_id + 1 per bot
    var pollingActive = {}; // boolean flags per bot
    var pollTimers = {};    // Timer per bot
    var inFlight = {};      // true while HTTP long‑poll is not finished
    var commandsRegistered = {};
    var _activeReplyMenus = {};
    var _webhookCleared = {};
    var _error409Streak = {};

    /**
     * Разрешён ли chat_id. Список читается из настроек В МОМЕНТ ПРОВЕРКИ.
     *
     * Раньше он собирался один раз при создании модуля и кэшировался. Движок и
     * настройки — разные сценарии хаба, и порядок их загрузки не определён:
     * стоило переимпортировать настройки (или загрузиться раньше них), как в
     * кэше навсегда оставался старый список. Симптом коварный — бот отвечает на
     * команды с anyChat и молчит на все остальные, будто «часть команд сломана».
     *
     * Пересборка на каждое сообщение стоит обхода нескольких записей объекта —
     * это ничто на фоне HTTP-запроса, которым сообщение и было получено.
     */
    function _isAllowedChat(chatId) {
        var settings = global.TGActionsSettings;
        if (!settings || !settings.chats) {
            return false;
        }
        var needle = String(chatId);
        for (var k in settings.chats) {
            if (settings.chats.hasOwnProperty(k) && String(settings.chats[k]) === needle) {
                return true;
            }
        }
        return false;
    }

    return {
        pollOffsets: pollOffsets,
        pollingActive: pollingActive,
        pollTimers: pollTimers,
        inFlight: inFlight,
        commandsRegistered: commandsRegistered,
        activeReplyMenus: _activeReplyMenus,
        webhookCleared: _webhookCleared,
        error409Streak: _error409Streak,
        isAllowedChat: _isAllowedChat,
        isCurrentEpoch: isCurrentEpoch,
        epoch: epoch
    };
}
