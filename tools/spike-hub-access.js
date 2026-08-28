/**
 * СПАЙК: доступен ли Hub из цепочки вызовов Telegram-бота.
 *
 * Зачем. Engine и Settings — ГЛОБАЛЬНЫЕ сценарии, а глобальному сценарию Sprut.Hub
 * запрещено менять характеристики устройств и ставить таймеры, вызывающие сам себя.
 * Нажатие кнопки в Telegram приходит именно так: таймер опроса внутри глобального
 * сценария → pollOnce → handler. Если запрет распространяется и на эту цепочку,
 * управлять домом из бота нельзя, и архитектуру надо менять (очередь команд +
 * логический сценарий на Hub.subscribe). Проверяем до того, как строить меню.
 *
 * КАК ПРИМЕНИТЬ (правится живой сценарий в хабе, не через build):
 *
 * 1. В хабе открыть глобальный сценарий «Telegram for Sprut. Part 1. ReadMe and Settings».
 * 2. Найти объект `var botCommands = {` и вставить блок ниже ПЕРВЫМ элементом внутрь него.
 * 3. Сохранить. ПРОВЕРИТЬ, ЧТО СОХРАНИЛОСЬ: перезагрузить страницу редактора и убедиться,
 *    что блок на месте — хаб гасит значок «сохранить», даже когда сценарий не сохранился.
 * 4. Перезапустить опрос: global.TGActions.stopPolling('botName1');
 *                        global.TGActions.startPolling('botName1');
 *    (или перезагрузить хаб — команда регистрируется в Telegram при старте опроса)
 * 5. В личке боту отправить /spike и прочитать ответ.
 * 6. ГЛАЗАМИ проверить лампу: спайк переключает ночник в кабинете (aId 21, cId 15).
 *    Ответ бота «ок» без физического щелчка — это не «ок».
 * 7. После проверки блок удалить.
 *
 * ЧТО ЗНАЧИТ РЕЗУЛЬТАТ:
 *   read: ok + write: ok + лампа переключилась → идём по плану, автообнаружение и
 *     управление работают из глобального сценария.
 *   read: ok + write: ошибка/без эффекта → подтвердился запрет на запись; нужна
 *     архитектура с очередью команд и логическим сценарием.
 *   read: ошибка → недоступен даже обход устройств; автообнаружение придётся
 *     переносить в логический сценарий.
 *
 * Устройство для проверки менять здесь:
 */
var SPIKE_A_ID = 21;   // Ночник, Кабинет
var SPIKE_C_ID = 15;   // характеристика «Включен» (HC.On)

/* ─────────────── вставлять внутрь var botCommands = { … } ─────────────── */

        spike: {
            description: 'Диагностика: доступен ли Hub из бота',
            handler: function (ctx) {
                var lines = ['*Спайк доступа к Hub*'];

                function step(title, fn) {
                    try {
                        lines.push(title + ': ' + fn());
                    } catch (e) {
                        lines.push(title + ': ОШИБКА — ' + e);
                    }
                }

                // 1. Чтение: работает ли обход устройств (нужно для автообнаружения)
                step('комнат', function () {
                    return String(Hub.getRooms().length);
                });

                step('аксессуаров', function () {
                    return String(Hub.getAccessories().length);
                });

                step('обход одной комнаты', function () {
                    var rooms = Hub.getRooms();
                    var i, accs;
                    for (i = 0; i < rooms.length; i++) {
                        accs = rooms[i].getAccessories();
                        if (accs.length) {
                            return rooms[i].getName() + ' → ' + accs[0].getName() +
                                ' → сервисов ' + accs[0].getServices(true).length;
                        }
                    }
                    return 'ни в одной комнате нет аксессуаров';
                });

                step('тип характеристики', function () {
                    var c = Hub.getAccessory(SPIKE_A_ID).getCharacteristic(SPIKE_C_ID);
                    return c.getName() + ' / ' + c.getType();
                });

                // 2. Запись: то, ради чего всё затевалось
                var before = null;
                step('значение до', function () {
                    before = Hub.getCharacteristicValue(SPIKE_A_ID, SPIKE_C_ID);
                    return String(before);
                });

                step('запись', function () {
                    Hub.setCharacteristicValue(SPIKE_A_ID, SPIKE_C_ID, !before);
                    return 'вызов прошёл без исключения';
                });

                step('значение после', function () {
                    var after = Hub.getCharacteristicValue(SPIKE_A_ID, SPIKE_C_ID);
                    return String(after) + (after === before
                        ? '  ← НЕ ИЗМЕНИЛОСЬ (может быть задержка хаба — смотрите на лампу)'
                        : '  ← изменилось');
                });

                // 3. Вернуть как было, чтобы спайк не оставлял следов
                step('возврат', function () {
                    Hub.setCharacteristicValue(SPIKE_A_ID, SPIKE_C_ID, before);
                    return String(Hub.getCharacteristicValue(SPIKE_A_ID, SPIKE_C_ID));
                });

                global.TGActions.sendSimpleMessage(
                    ctx.botName, String(ctx.chatId), lines.join('\n'));
                _logger.info('spike: {}', lines.join(' | '));
            }
        },
