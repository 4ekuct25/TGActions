/* #####Описание#####
Yandex for Sprut

Код предоставляется AsIs без каких-либо гарантий.
ВАЖНО! Перед использованием прочтите инструкцию и произведите настройки. Настройка делается в сценарии Yandex for Sprut. Part 1. ReadMe and Settings
В данном сценарии ничего менять руками не нужно.

Изменения v0.4.3 (17.06.25):
1. Проверка валидности полученных cookies запросом к серверу (tokenURL) перед сохранением в LocalStorage.
2. Хранение предыдущей версии cookies в LocalStorage и логирование разницы между старыми и новыми cookies. Добавлена функция getCookiesChangeDiff(), возвращающая последнюю разницу.
3. Подробные логи: до и после сохранения выводятся как прежние, так и обновлённые cookies.
4. Код приведён к синтаксису JavaScript ES5 (var вместо let/const, отсутствие стрелочных функций).
*/

/* eslint-disable no-var */

global.YAActions = (function () {
    //!!!!!//
    var version = "#v0.4.3#17.06.25"; //Не изменять
    //!!!!!//

    /**
     * Внутренние переменные модуля
     */
    var csrf_token = ""; //Не требуется заполнять вручную
    var cookies = ""; //Не требуется заполнять вручную
    var _lastCookiesDiff = null; // хранит последнюю разницу cookies

    var _yandexSmartHomeSettingsName = 'YandexActionsCookies';
    var tokenURL = "https://yandex.ru/quasar?storage=1"; //Не изменять
    var logPrefix = 'YAActions'; //Не изменять. Префикс сообщений в логе модуля.
    var uriDevices = "https://iot.quasar.yandex.ru/m/user/devices/"; //Не изменять

    var MAX_PHRASE_LENGTH = 99; //Максимальная длинна одного блока фразы
    var AVERAGE_SPEECH_SPEED = 125; // Средняя скорость речи (слов в минуту)
    var INITIAL_VOLUME_DELAY = 0; // Задержка после установки громкости перед началом речи
    var PHRASE_ACTION_DELAY = 6000; // Задержка перед отправкой массива phrase_action.

    var _logger = null;
    var MAX_RETRIES = 3; //Колличество попыток отправки запроса в УД Яндекс
    var RETRY_DELAY = 5000; //Время задержки между попытками отправки запроса в УД

    //Список поддерживаемых Actions
    var instanceTypes = {
        "phrase_action": {
            "type": "devices.capabilities.quasar.server_action",
            "format": function (instance, data) {
                return { "instance": instance, "value": data };
            }
        },
        "text_action": {
            "type": "devices.capabilities.quasar.server_action",
            "format": function (instance, data) {
                return { "instance": instance, "value": data };
            }
        },
        "on": {
            "type": "devices.capabilities.on_off",
            "format": function (instance, data) {
                return { "instance": instance, "value": data };
            }
        },
        "volume": {
            "type": "devices.capabilities.quasar.server_action",
            "format": function (instance, data) {
                return { "instance": "text_action", "value": "Молча установи громкость звука " + data };
            }
        }
    };

    initialize();

    /**
     * Публичные функции модуля
     */
    return {
        sayPhraseWithVolume: sayPhraseWithVolume,
        sayPhraseWithVolumeById: sayPhraseWithVolumeById,
        sayPhrase: sayPhrase,
        sayPhraseById: sayPhraseById,
        voiceComand: voiceComand,
        voiceComandById: voiceComandById,
        switchStatus: switchStatus,
        switchStatusById: switchStatusById,
        switchComand: switchComand,
        switchComandById: switchComandById,
        deviceIsOnline: deviceIsOnline,
        deviceIsOnlineById: deviceIsOnlineById,
        sendActions: sendActions,
        sendActionsById: sendActionsById,
        refreshCookies: refreshCookies,
        getCookiesChangeDiff: getCookiesChangeDiff, // новая публичная функция
        caseDevice: global.caseDevice
    };

    /**
     * ---------------------------------------------------------
     *  ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ (cookies & diff)
     * ---------------------------------------------------------
     */

    /**
     * Проверка валидности cookies однократным запросом к server (tokenURL).
     * @param {String} cookiesStr
     * @returns {Boolean}
     */
    function isCookiesValid(cookiesStr) {
        var response = HttpClient.GET(tokenURL)
            .header('Cookie', cookiesStr)
            .send();
        var status = response.getStatus();
        return status === 200;
    }

    /**
     * Подсчёт различий между двумя строками cookies
     * @param {String} oldCookiesStr
     * @param {String} newCookiesStr
     * @returns {Object} diff {added:{}, removed:{}, updated:{from:*,to:*}}
     */
    function diffCookies(oldCookiesStr, newCookiesStr) {
        if (typeof oldCookiesStr === 'undefined' || oldCookiesStr === null) oldCookiesStr = '';
        if (typeof newCookiesStr === 'undefined' || newCookiesStr === null) newCookiesStr = '';

        var oldObj = global.CookiesUtils.toObject(oldCookiesStr);
        var newObj = global.CookiesUtils.toObject(newCookiesStr);

        var diff = { added: {}, removed: {}, updated: {} };

        for (var key in oldObj) {
            if (!oldObj.hasOwnProperty(key)) continue;
            if (!newObj.hasOwnProperty(key)) {
                diff.removed[key] = oldObj[key];
            } else if (oldObj[key] !== newObj[key]) {
                diff.updated[key] = { from: oldObj[key], to: newObj[key] };
            }
        }
        for (var nkey in newObj) {
            if (!newObj.hasOwnProperty(nkey)) continue;
            if (!oldObj.hasOwnProperty(nkey)) {
                diff.added[nkey] = newObj[nkey];
            }
        }
        return diff;
    }

    /**
     * Публичный геттер последней разницы cookies
     */
    function getCookiesChangeDiff() {
        return _lastCookiesDiff;
    }

    /**
     * ---------------------------------------------------------
     *  ФУНКЦИИ ОБРАБОТКИ ТЕКСТА / ДЕЙСТВИЙ (оригинал)
     * ---------------------------------------------------------
     */

    // Функция разделения длинной фразы на части
    function splitPhrase(phrase) {
        var parts = [];
        var words = phrase.split(/([,\.\?!\s])/);
        var currentPart = "";

        words.forEach(function (word) {
            if ((currentPart + word).length > MAX_PHRASE_LENGTH) {
                parts.push(currentPart.trim());
                currentPart = word;
            } else {
                currentPart += word;
            }
        });
        if (currentPart.trim()) {
            parts.push(currentPart.trim());
        }
        return parts;
    }

    // Функция вычисления задержки речи
    function calculateSpeechDelay(phrase) {
        return (phrase.split(/\s+/).length / AVERAGE_SPEECH_SPEED) * 60000;
    }

    // Создание списка действия для Яндекс API
    function createActions(instance, data) {
        var FUNCTION_NAME = 'createActions';
        if (!instanceTypes.hasOwnProperty(instance)) {
            _logger.info("{}.В функцию по управлению колонкой передан неизвестный instance: {}", FUNCTION_NAME, instance);
            return [];
        }
        return [{
            "type": instanceTypes[instance].type,
            "state": instanceTypes[instance].format(instance, data)
        }];
    }

    // Отправка действий на колонку по названию
    function sendActions(deviceName, actions, delay) {
        if (typeof delay === 'undefined') delay = 0;
        var device = global.caseDevice(deviceName);
        if (!device) return;
        return sendActionsById(device, actions, delay);
    }

    // Отправка действий на колонку по Id
    function sendActionsById(device, actions, delay) {
        if (typeof delay === 'undefined') delay = 0;
        setTimeout(function () {
            var uri = uriDevices + device + "/actions";
            return sendPostRequest(uri, { actions: actions });
        }, delay);
    }

    /**
     * ---------------------------------------------------------
     *  ЗАПРОСЫ С ПОВТОРАМИ
     * ---------------------------------------------------------
     */

    function sendRequestWithRetry(method, url, data) {
        var FUNCTION_NAME = 'sendRequestWithRetry';
        var attempt = 0;

        function trySendRequest() {
            attempt++;
            var request = HttpClient[method](url)
                .header("Content-Type", "application/json")
                .header("Cookie", cookies)
                .header("x-csrf-token", csrf_token);

            if (data) {
                request.body(JSON.stringify(data));
            }

            var response = request.send();
            var status = response.getStatus();

            if (status === 401 || status === 403) {
                _logger.warn("{}.Токен устарел, обновляем...", FUNCTION_NAME);
                refreshCookies();
                refreshToken();

                request = HttpClient[method](url)
                    .header("Content-Type", "application/json")
                    .header("Cookie", cookies)
                    .header("x-csrf-token", csrf_token);

                if (method === 'POST' && data) {
                    request.body(JSON.stringify(data));
                }

                response = request.send();
                status = response.getStatus();
            }

            if (status !== 200) {
                _logger.error("{}.Ошибка команды {}. Попытка {}/{}. Отправили url: {}, data: {}. Получили Status: {}, Body: {}", FUNCTION_NAME,
                    method, attempt, MAX_RETRIES, url, JSON.stringify(data), status, response.getBody());

                if (attempt < MAX_RETRIES) {
                    _logger.warn("{}.Повторная попытка отправки запроса через {} мс", FUNCTION_NAME, RETRY_DELAY);
                    setTimeout(trySendRequest, RETRY_DELAY);
                } else {
                    _logger.error("{}.Исчерпано максимальное количество попыток отправки запроса.", FUNCTION_NAME);
                }
            }

            return response;
        }

        return trySendRequest();
    }

    function sendPostRequest(url, data) {
        return sendRequestWithRetry('POST', url, data);
    }

    function sendGetRequest(url, data) {
        return sendRequestWithRetry('GET', url, data);
    }

    /**
     * ---------------------------------------------------------
     *  УПРАВЛЕНИЕ ПРОИЗНЕСЕНИЕМ
     * ---------------------------------------------------------
     */

    function sayPhraseWithVolumeById(device, phrase, startVolume, endVolume) {
        var FUNCTION_NAME = 'sayPhraseWithVolumeById';
        if (!isDeviceHealthyById(device)) { return null; }
        var delayBeforePhrase = 0;

        if (startVolume !== null && typeof startVolume !== 'undefined') {
            sendActionsById(device, createActions("volume", startVolume), INITIAL_VOLUME_DELAY);
            delayBeforePhrase = PHRASE_ACTION_DELAY;
            _logger.info("{}.Установили звук на старте", FUNCTION_NAME);
        }

        var phraseParts = splitPhrase(phrase);
        var phraseActions = [];

        phraseParts.forEach(function (part) {
            phraseActions = phraseActions.concat(createActions("phrase_action", part));
        });

        sendActionsById(device, phraseActions, delayBeforePhrase);

        var delay = calculateSpeechDelay(phrase);
        if (endVolume !== null && typeof endVolume !== 'undefined') {
            sendActionsById(device, createActions("volume", endVolume), delayBeforePhrase + delay);
        }
        return true;
    }

    function sayPhraseWithVolume(deviceName, phrase, startVolume, endVolume) {
        var FUNCTION_NAME = 'sayPhraseWithVolume';
        var device = global.caseDevice(deviceName);
        _logger.info("{}.sayPhraseWithVolume start", FUNCTION_NAME);
        if (!device) return;
        return sayPhraseWithVolumeById(device, phrase, startVolume, endVolume);
    }

    function voiceComandById(device, voiceComand) {
        if (!isDeviceHealthyById(device)) { return null; }
        var actions = createActions("text_action", voiceComand);
        return sendActionsById(device, actions);
    }

    function voiceComand(deviceName, voiceComand) {
        var device = global.caseDevice(deviceName);
        if (!device) return;
        return voiceComandById(device, voiceComand);
    }

    function sayPhraseById(device, phrase) {
        if (!isDeviceHealthyById(device)) { return null; }
        return sayPhraseWithVolumeById(device, phrase, null, null);
    }

    function sayPhrase(deviceName, phrase) {
        var device = global.caseDevice(deviceName);
        if (!device) return;
        return sayPhraseById(device, phrase);
    }

    /**
     * ---------------------------------------------------------
     *  РАБОТА С УСТРОЙСТВАМИ
     * ---------------------------------------------------------
     */

    function isDeviceExist(device) {
        var FUNCTION_NAME = 'isDeviceExist';
        var uri = uriDevices + device;
        var response = sendGetRequest(uri);
        var status = response.getStatus();
        if (status === 404) {
            _logger.error("{}.Ошибка команды. Отправили url:{}, device: {}. Получили Status: {}, Body: {}", FUNCTION_NAME, uri, device, response.getStatus(), JSON.stringify(response.getBody()));
            return false;
        }
        if (status === 200) { return true; }
        return false;
    }

    function isDeviceHealthyById(device) {
        var FUNCTION_NAME = 'isDeviceHealthyById';
        var status = true;
        var deviceExist = isDeviceExist(device);
        if (!deviceExist) {
            _logger.error("{}.Устройство не найдено в умном доме id:'{}'", FUNCTION_NAME, device);
            status = false;
        }
        var online = deviceIsOnlineById(device);
        if (!online) {
            _logger.error("{}.Устройство не в статусе onLine в умном доме id:'{}'", FUNCTION_NAME, device);
            status = false;
        }
        return status;
    }

    function switchStatusById(device) {
        var FUNCTION_NAME = 'switchStatusById';
        if (!isDeviceHealthyById(device)) { return null; }

        var uri = uriDevices + device;
        var response = sendGetRequest(uri);

        if (response.getStatus() !== 200) {
            _logger.error("{}.Ошибка получения состояния устройства: {}", FUNCTION_NAME, response.getStatus());
            return null;
        }

        var body = JSON.parse(response.getBody());
        var capabilities = body.capabilities;

        for (var i = 0; i < capabilities.length; i++) {
            if (capabilities[i].type === "devices.capabilities.on_off") {
                return capabilities[i].state.value === true;
            }
        }

        _logger.error("{}.Состояние on_off не найдено для устройства: {}", FUNCTION_NAME, device);
        return response;
    }

    function switchStatus(deviceName) {
        var device = global.caseDevice(deviceName);
        if (!device) return null;
        return switchStatusById(device);
    }

    function deviceIsOnlineById(device) {
        var FUNCTION_NAME = 'deviceIsOnlineById';
        var deviceExist = isDeviceExist(device);
        if (!deviceExist) {
            _logger.error("{}.Устройство не найдено в умном доме id:'{}'", FUNCTION_NAME, device);
            return null;
        }

        var uri = uriDevices + device;
        var response = sendGetRequest(uri);

        if (response.getStatus() !== 200) {
            _logger.error("{}.Ошибка получения состояния устройства: {}", FUNCTION_NAME, response.getStatus());
            return null;
        }

        var body = JSON.parse(response.getBody());
        var statusInfo = body.status_info;

        if (statusInfo && statusInfo.status) {
            var result = statusInfo.status === "online";
            if (!result) {
                _logger.warn("{}.Устройство не online. Статус: '{}' для устройства:'{}'", FUNCTION_NAME, statusInfo.status, device);
            }
            return result;
        }
        _logger.error("{}.status_info не найдено для устройства: {}", FUNCTION_NAME, device);
        return null;
    }

    function deviceIsOnline(deviceName) {
        var device = global.caseDevice(deviceName);
        if (!device) return;
        return deviceIsOnlineById(device);
    }

    function switchComandById(device, comand) {
        var FUNCTION_NAME = 'switchComandById';
        var validCommands = { "On": true, "Off": false, "Switch": "switch" };
        if (!isDeviceHealthyById(device)) { return null; }
        if (!validCommands.hasOwnProperty(comand)) {
            _logger.warn("{}.Неверная команда: {}", FUNCTION_NAME, comand);
            return;
        }

        if (comand === "Switch") {
            var uri = uriDevices + device;
            var response = sendGetRequest(uri);
            if (response.getStatus() !== 200) {
                _logger.error("{}.Ошибка получения состояния устройства: {}", FUNCTION_NAME, response.getStatus());
                return;
            }
            var body = JSON.parse(response.getBody());
            var caps = body.capabilities;
            var currentState = null;
            for (var i = 0; i < caps.length; i++) {
                if (caps[i].type === "devices.capabilities.on_off") {
                    currentState = caps[i].state.value;
                    break;
                }
            }
            if (currentState === null) {
                _logger.error("{}.Не удалось определить текущее состояние устройства: {}", FUNCTION_NAME, device);
                return;
            }
            var newState = !currentState;
            var actions = createActions("on", newState);
            sendActionsById(device, actions);
        } else {
            var actions2 = createActions("on", validCommands[comand]);
            sendActionsById(device, actions2);
        }
        return true;
    }

    function switchComand(deviceName, comand) {
        var device = global.caseDevice(deviceName);
        if (!device) return;
        return switchComandById(device, comand);
    }

    /**
     * ---------------------------------------------------------
     *  WORK WITH COOKIES
     * ---------------------------------------------------------
     */

    function refreshToken() {
        var FUNCTION_NAME = 'refreshToken';
        var response = HttpClient.GET(tokenURL).header("Cookie", cookies).send();
        if (response.getStatus() !== 200) {
            _logger.error("{}.Ошибка обновления refreshToken: Status: {}, Body: {}", FUNCTION_NAME, response.getStatus(), JSON.stringify(response.getBody()));
            return;
        }
        csrf_token = JSON.parse(response.getBody()).storage.csrfToken2;
        _logger.info("{}.csrf_token обновлён.", FUNCTION_NAME);
    }

    function refreshCookies() {
        var FUNCTION_NAME = 'refreshCookies';

        // Получаем текущие настройки и куки
        var settings = global.LocalStorage.getValue(_yandexSmartHomeSettingsName) || {};
        var currentCookies = settings.cookies || cookies;

        _logger.info("{}.Инициализация запроса токена. Текущие cookies: {}", FUNCTION_NAME, currentCookies);

        // Выполняем GET‑запрос
        var response = HttpClient.GET(tokenURL)
            .header('Cookie', currentCookies)
            .send();

        var status = response.getStatus();

        if (status !== 200) {
            _logger.error("{}.Ошибка HTTP: Status: {}, Body: {}", FUNCTION_NAME, status, JSON.stringify(response.getBody()));
            return;
        }

        // Объединяем старые и новые cookies
        var responseCookies = response.getCookies();
        if (!responseCookies || global.CookiesUtils.isEmpty(responseCookies)) {
            _logger.warn("{}.Ответ не содержит cookies для обновления.", FUNCTION_NAME);
            return;
        }

        var newCookiesStr = global.CookiesUtils.toString(
            global.CookiesUtils.apply(
                global.CookiesUtils.toObject(currentCookies),
                responseCookies
            )
        );

        // Проверка валидности
        if (!isCookiesValid(newCookiesStr)) {
            _logger.error("{}.Получены невалидные cookies. Запись в LocalStorage отменена.", FUNCTION_NAME);
            return;
        }

        // Рассчитываем разницу
        _lastCookiesDiff = diffCookies(currentCookies, newCookiesStr);
        _logger.info("{}.Разница cookies: {}", FUNCTION_NAME, JSON.stringify(_lastCookiesDiff));

        // Лог до сохранения
        _logger.info("{}.Сохраняем cookies. Было: {}, Стало: {}", FUNCTION_NAME, currentCookies, newCookiesStr);

        // Пишем в LocalStorage
        try {
            global.LocalStorage.setValue(_yandexSmartHomeSettingsName, {
                cookies: newCookiesStr,
                prevCookies: currentCookies
            });
        } catch (err) {
            _logger.error("{}.Ошибка при записи в LocalStorage: {}", FUNCTION_NAME, err);
            return;
        }

        // Проверяем запись
        var savedSettings = global.LocalStorage.getValue(_yandexSmartHomeSettingsName) || {};
        var savedCookies = savedSettings.cookies;
        if (typeof savedCookies === 'undefined' || savedCookies !== newCookiesStr) {
            _logger.error("{}.Проверка сохранения неудачна. Ожидалось: {}, Получено: {}", FUNCTION_NAME, newCookiesStr, savedCookies);
        } else {
            cookies = newCookiesStr; // Обновляем глобальные cookies после успешного сохранения
            _logger.info("{}.Cookies успешно сохранены. Было: {}, Стало: {}", FUNCTION_NAME, currentCookies, cookies);
        }
    }

    /**
     * ---------------------------------------------------------
     *  ИНИЦИАЛИЗАЦИЯ
     * ---------------------------------------------------------
     */

    function initialize() {
        var FUNCTION_NAME = 'initialize';
        _logger = global.LoggerFactory.create(logPrefix + ' ' + version);
        _logger.info("{}.Инициализация. Yandex for Sprut. Part 2. Engine.Start", FUNCTION_NAME);

        var storedSettings = global.LocalStorage.getValue(_yandexSmartHomeSettingsName);
        if (storedSettings && storedSettings.cookies) {
            cookies = storedSettings.cookies;
        } else {
            cookies = global.getInitialCookeies ? global.getInitialCookeies() : '';
        }

        _logger.info("{}.Инициализация. Yandex for Sprut. Part 2. Engine.Finish", FUNCTION_NAME);
    }
})();
