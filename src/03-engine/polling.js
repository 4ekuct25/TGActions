/**
 * Жизненный цикл long-polling: старт, стоп, один опрос, перезапуск,
 * обработка 503/409 и back-off.
 *
 * Зависимости: logger, constants, helpers, state, commands, updates.
 */
function TGActionsPolling(ns) {
    var _logger = ns.logger;
    var CONSTANTS = ns.constants.CONSTANTS;
    var getBot = ns.helpers.getBot;
    var buildApiUrl = ns.helpers.buildApiUrl;
    var safeClearTimer = ns.helpers.safeClearTimer;
    var pollOffsets = ns.state.pollOffsets;
    var pollingActive = ns.state.pollingActive;
    var pollTimers = ns.state.pollTimers;
    var inFlight = ns.state.inFlight;
    var _webhookCleared = ns.state.webhookCleared;
    var _error409Streak = ns.state.error409Streak;
    var registerBotCommands = ns.commands.registerBotCommands;
    var processUpdates = ns.updates.processUpdates;

    /**
     * Запускает long‑polling. Вызывайте в начале работы скрипта.
     *
     * @example
     * TGActions.startPolling('botName1');
     */
    function startPolling(botName) {
        // Полный сброс служебных флагов перед каждым новым запуском
        _webhookCleared[botName] = false;
        _error409Streak[botName] = 0;

        if (pollingActive[botName]) {
            _logger.warn('startPolling: {} already active', botName);
            return;
        }
        registerBotCommands(botName);
        pollingActive[botName] = true;
        inFlight[botName] = false;
        if (!pollOffsets.hasOwnProperty(botName)) {
            pollOffsets[botName] = 0;
        }
        // Стартуем чуть позже, чтобы гарантированно завершился предыдущий long‑poll
        scheduleNextPoll(botName, 10000);
    }

    /** Останавливает long‑polling. */
    function stopPolling(botName) {
        // Сброс флагов, чтобы следующий запуск был «чистым»
        _webhookCleared[botName] = false;
        _error409Streak[botName] = 0;

        if (!pollingActive[botName]) {
            return;
        }
        pollingActive[botName] = false;
        safeClearTimer(pollTimers[botName]);
        pollTimers[botName] = null;
        inFlight[botName] = false;
        _logger.info('stopPolling: halted for {}', botName);
    }

    function scheduleNextPoll(botName, delayMs) {
        if (!pollingActive[botName]) {
            return;
        }
        var now2 = new Date();

        _logger.info('scheduleNextPoll streak at {}', now2.toTimeString());
        safeClearTimer(pollTimers[botName]);

        pollTimers[botName] = setTimeout(function () {
            pollOnce(botName);
        }, delayMs);
    }

    /**
     * Выполняет один запрос getUpdates (long‑polling). Внутренняя логика
     * обработки ошибок, 503/409 и т.д. вынесена сюда.
     */
    function pollOnce(botName) {
        if (!pollingActive[botName]) {
            return;
        }
        if (inFlight[botName]) {
            _logger.warn('pollOnce {} – skipped, request still in flight', botName);
            scheduleNextPoll(botName, CONSTANTS.POLL_LOOP_DELAY_MS);
            return;
        }
        inFlight[botName] = true;

        function finalize(delay) {
            inFlight[botName] = false;
            scheduleNextPoll(botName, delay);
        }

        // Всё, что может бросить, — внутри try. Раньше getBot и сборка URL
        // стояли снаружи, и любая их ошибка уходила мимо обработчика прямо
        // из колбэка таймера: цепочка опроса обрывалась НАВСЕГДА, inFlight
        // оставался true, бот молча переставал отвечать. Так и случилось,
        // когда сценарий настроек на минуту исчез при переустановке —
        // global.TGActionsSettings стал undefined, и getBot бросил TypeError.
        var bot, offset, timeoutS, url, userDelay;
        try {
            bot = getBot(botName);
            offset = pollOffsets[botName] || 0;
            timeoutS = bot.pollTimeout || CONSTANTS.DEFAULT_POLL_TIMEOUT;
            url = buildApiUrl(bot.key, CONSTANTS.GET_UPDATES_ENDPOINT) +
                '?offset=' + offset +
                '&timeout=' + timeoutS;
            userDelay = bot.updateInterval || 0;

            var now = new Date();

            _logger.info('pollOnce at {}', now.toTimeString());
            var resp = HttpClient.GET(url).send();
            var status = resp.getStatus();

            if (status === 200) {
                _error409Streak[botName] = 0;    // ← streak reset
                if (pollingActive[botName] && resp.getBody()) {
                    var data;
                    try {
                        data = JSON.parse(resp.getBody());
                    } catch (eJson) {
                        _logger.error('pollOnce JSON parse error: {}', eJson);
                    }
                    if (data && Array.isArray(data.result)) {
                        processUpdates(botName, data.result);
                    }
                }
                finalize(userDelay);
                return;
            }

            if (status === 503) {
                _error409Streak[botName] = 0;    // ← streak reset
                _logger.warn('pollOnce {} – HTTP 503', botName);
                finalize(CONSTANTS.RETRY_DELAY_ON_503_MS);
                return;
            }

            if (status === 409) {
                // Первая встреча 409 – пробуем снять webhook
                if (!_webhookCleared[botName]) {
                    _logger.warn('pollOnce {} – HTTP 409, deleting webhook', botName);
                    try {
                        HttpClient.POST(buildApiUrl(bot.key, '/deleteWebhook'))
                            .queryString('drop_pending_updates', 'true')
                            .send();
                        _webhookCleared[botName] = true;
                    } catch (eWh) {
                        _logger.error('deleteWebhook error for {}: {}', botName, eWh);
                    }
                    _error409Streak[botName] = 1;
                    finalize(CONSTANTS.RETRY_DELAY_ON_409_MS);
                    return;
                }

                // Повторный 409 – наращиваем задержку (max 60 s)
                _error409Streak[botName] = (_error409Streak[botName] || 1) + 1;
                var backoff = CONSTANTS.RETRY_DELAY_ON_409_MS * _error409Streak[botName];
                if (backoff > 60000) {
                    backoff = 60000;
                }
                var now2 = new Date();

                _logger.info('409streak  at {}', now2.toTimeString());
                _logger.warn('pollOnce {} – repeated 409 (streak {}), back‑off {} ms',
                    botName, _error409Streak[botName], backoff);
                pollOffsets[botName] = 0; // на всякий случай сбрасываем offset
                finalize(backoff);
                return;
            }

            // Любой другой статус
            _logger.error('pollOnce {} – unexpected status {}', botName, status);
            finalize(CONSTANTS.RETRY_DELAY_ON_503_MS);
        } catch (e) {
            _logger.error('pollOnce exception for {}: {}', botName, e);
            finalize(CONSTANTS.RETRY_DELAY_ON_503_MS);
        }
    }

    function rebootPolling(botName) {
        var bot = getBot(botName);
        var pollTimeout = bot.pollTimeout || CONSTANTS.DEFAULT_POLL_TIMEOUT;
        var delayMs = (pollTimeout * 2 + 1) * 1000;

        _logger.info('rebootBot: restarting {} after {} ms', botName, delayMs);

        stopPolling(botName);

        setTimeout(function () {
            startPolling(botName);
        }, delayMs);
    }

    return {
        startPolling: startPolling,
        stopPolling: stopPolling,
        rebootPolling: rebootPolling,
        scheduleNextPoll: scheduleNextPoll,
        pollOnce: pollOnce
    };
}
