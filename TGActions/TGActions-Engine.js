/* #####Описание#####
Yandex for Sprut

Код предоставляется AsIs без каких-либо гарантий.
ВАЖНО! Перед использованием прочтите инструкцию и произведите настройки. Настройка делается в сценарии Yandex for Sprut. Part 1. ReadMe and Settings
В данном сценарии ничего менять руками не нужно.
*/


global.YAActions = (function(){
//!!!!!//
const version = "#v0.4.2#20.04.25"//Не изменять
//!!!!!//

let csrf_token = ""; //Не требуется заполнять вручную
let cookies = ""; //Не требуется заполнять вручную

const _yandexSmartHomeSettingsName = 'YandexActionsCookies';
let tokenURL = "https://yandex.ru/quasar?storage=1"; //Не изменять
let logPrefix = 'YAActions'; //Не изменять. Префикс сообщений в логе модуля.
const uriDevices="https://iot.quasar.yandex.ru/m/user/devices/" //Не изменять
const MAX_PHRASE_LENGTH = 99; //Максимальная длинна одного блока фразы
const AVERAGE_SPEECH_SPEED = 125; // Средняя скорость речи (слов в минуту)
const INITIAL_VOLUME_DELAY = 0; // Задержка после установки громкости перед началом речи
const PHRASE_ACTION_DELAY = 6000; // Задержка перед отправкой массива phrase_action. Сокращение задержки повысит шанс пропустить произнесение части текста в случае попытки установки той же громкости, что стояла на колонке
let _logger=null;
const MAX_RETRIES = 3; //Колличество попыток отправки запроса в УД Яндекс
const RETRY_DELAY = 5000; //Время задержки между попытками отправки запроса в УД

//const devicesList = global.devicesListSettings;
//Списокк поддерживаемых Actions, для которых модуль умеет формировать JSON для передаче устройствам
const instanceTypes = {
    "phrase_action": {
        "type": "devices.capabilities.quasar.server_action",
        "format": function(instance, data) {
            return { "instance": instance, "value": data };
        }
    },
    "text_action": {
        "type": "devices.capabilities.quasar.server_action",
        "format": function(instance, data) {
            return { "instance": instance, "value": data };
        }
    },
    "on": {
        "type": "devices.capabilities.on_off",
        "format": function(instance, data) {
            return { "instance": instance, "value": data };
        }
    },
    "volume": {
        "type": "devices.capabilities.quasar.server_action",
        "format": function(instance, data) {
            return { "instance": "text_action", "value": "Молча установи громкость звука " + data };
        }
    }//volume поддерживается через заплатку с отсылкой текстовой команды
};

initialize();

//Объявление списка публичных функций, доступных для пользователей модуля. Все остальные функции - приватные и доступны только внутри контекста сценария
return { 
        sayPhraseWithVolume:sayPhraseWithVolume,
        sayPhraseWithVolumeById:sayPhraseWithVolumeById,
        sayPhrase:sayPhrase,
        sayPhraseById:sayPhraseById,
        voiceComand: voiceComand,
        voiceComandById: voiceComandById,
        switchStatus: switchStatus,
        switchStatusById: switchStatusById,
        switchComand:switchComand,
        switchComandById:switchComandById,
        deviceIsOnline: deviceIsOnline,
        deviceIsOnlineById:deviceIsOnlineById,
        sendActions:sendActions,
        sendActionsById:sendActionsById,
        refreshCookies:refreshCookies,
        caseDevice:global.caseDevice
};

// Функция разделения длинной фразы на части
function splitPhrase(phrase) {
    let parts = [];
    let words = phrase.split(/([,\.\?!\s])/);
    let currentPart = "";

    words.forEach(function(word) {
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
  // Вычисляем задержку, исходя из средней скорости речи (слов в минуту)
  return (phrase.split(/\s+/).length / AVERAGE_SPEECH_SPEED) * 60000;
}

// Создание списка действия для списка действий для Яндекс API
function createActions(instance, data) {
  var FUNCTION_NAME = 'createActions';
    if (!instanceTypes.hasOwnProperty(instance)) {
         _logger.info("{}.В функцию по управлению колонкой передан неизвестный instance: {}",FUNCTION_NAME, instance);
        return [];
    }

    return [{
        "type": instanceTypes[instance].type,
        "state": instanceTypes[instance].format(instance, data)
    }];
}

// Отправка действий на колонку с учетом возможной задержки по Имени. Возвращает responce запроса
function sendActions(deviceName, actions, delay = 0) {
  var device = global.caseDevice(deviceName);
  if (!device) return;
  return sendActionsById(device, actions, delay);
}

// Отправка действий на колонку с учетом возможной задержки по Id. Возвращает responce запроса
function sendActionsById(device, actions, delay = 0) {
  setTimeout(function() {
    const uri = uriDevices + device + "/actions";
    return sendPostRequest(uri, { actions });
  }, delay);
}

//Функция проверки существует ли устройство в УД Яндекс под вашей учетной записью.
function isDeviceExist (device)
{
  var FUNCTION_NAME = 'isDeviceExist';
  var uri = uriDevices + device;
  var response = sendGetRequest(uri);
  const status = response.getStatus();
  if (status === 404) {
      _logger.error("{}.Ошибка команды. Отправили url:{}, device: {}. Получили Status: {}, Body: {}", FUNCTION_NAME, url,device,response.getStatus(), JSON.stringify(response.getBody()));
      return false;
    }
  if (status === 200) {return true;}
  return false;
}

//Функция проверки "здоровья" устройства. Служит реализации всех проверок на возможность обращения к устройству
function isDeviceHealthyById (device)
{ 
  var FUNCTION_NAME = 'isDeviceHealthyById';
  var status = true
  //Проверяем найдено ли устройство в УД. 
  var deviceEsist = isDeviceExist (device)
  if (!deviceEsist) {
      _logger.error("{}.Устройство не найдено в умном доме id:'{}'",FUNCTION_NAME,device);
      status = false;
  }
  //Проверяем online ли устройство
  var deviceIsOnline = deviceIsOnlineById(device);
  if (!deviceIsOnline) {
      _logger.error("{}.Устройство не в статусе onLine в умном доме id:'{}'",FUNCTION_NAME,device);
      status = false;
  }
  return status;
}

// Основная функция управления произнесением с опциональной настройкой громкости по id устройства в УД Яндекс
function sayPhraseWithVolumeById(device, phrase, startVolume, endVolume)
{
  var FUNCTION_NAME = 'sayPhraseWithVolumeById';
  if (!isDeviceHealthyById (device)) {return null};
  let delayBeforePhrase = 0;

  // Устанавливаем начальную громкость, если указано
  if (startVolume !== null) {
    sendActionsById(device, createActions("volume", startVolume), INITIAL_VOLUME_DELAY);
    delayBeforePhrase = PHRASE_ACTION_DELAY;
    _logger.info("{}.Установили звук на старте",FUNCTION_NAME)
  }
 
  //Разделям фразу на части нужного размера
  var phraseParts = splitPhrase(phrase);
  let phraseActions = [];
  
  //Формируем массив частей фразы на отправку
  phraseParts.forEach(function(part) {
    phraseActions = phraseActions.concat(createActions("phrase_action", part));
  });

  // Отправка phrase_action без задержки, если громкость не изменялась
  sendActionsById(device, phraseActions, delayBeforePhrase);


  // Устанавливаем конечную громкость после завершения произнесения с учетом расчитанной из скорости произнесения задержки
  let delay = calculateSpeechDelay(phrase);
  if (endVolume !== null) {
        sendActionsById(device, createActions("volume", endVolume), delayBeforePhrase + delay);
    }

  
  return true;
}

// Основная функция управления произнесением с опциональной настройкой громкости по названию устройства
function sayPhraseWithVolume(deviceName, phrase, startVolume, endVolume) {
  var FUNCTION_NAME = 'sayPhraseWithVolume';
  //_logger.info("sayPhraseWithVolume start")
  const device = global.caseDevice(deviceName);
  _logger.info("{}.sayPhraseWithVolume start",FUNCTION_NAME)
  if (!device) return;
  return sayPhraseWithVolumeById(device, phrase, startVolume, endVolume)
}

// Функция отправки голосовой команды в формате text_action по Id
function voiceComandById(device, voiceComand) {
  if (!isDeviceHealthyById (device)) {return null};
  var actions = createActions("text_action", voiceComand);
  return sendActionsById(device, actions);
}

// Функция отправки голосовой команды в формате text_action по названию
function voiceComand(deviceName, voiceComand) {
  var device = global.caseDevice(deviceName);
  if (!device) return;
  return voiceComandById(device, voiceComand)
}

// Функция произнесения текста без изменения громкости по Id
function sayPhraseById(device, phrase) {
  if (!isDeviceHealthyById (device)) {return null};
  return sayPhraseWithVolumeById(device, phrase, null, null);
}

// Функция произнесения текста без изменения громкости по Названию
function sayPhrase(deviceName, phrase) {
  var device = global.caseDevice(deviceName);
  if (!device) return;
  return sayPhraseById(device, phrase);
}

//Функция опправки запроса в УД Ядекс. Обеспечивает, при ниобходимости, отправку несколько раз и обновление cookies, token 
function sendRequestWithRetry(method, url, data) {
  var FUNCTION_NAME = 'sendRequestWithRetry';
  var attempt = 0;

  function trySendRequest() {
    attempt++;
    var request = HttpClient[method](url)
      .header("Content-Type", "application/json")
      .header("Cookie", cookies)
      .header("x-csrf-token", csrf_token);
    _logger.warn("{}.x-csrf-token: {} ",FUNCTION_NAME, csrf_token);
    if (data) {
      request.body(JSON.stringify(data));
    }

    var response = request.send();
    var status = response.getStatus();

    if (status === 401 || status === 403) {
      _logger.warn("{}.Токен устарел, обновляем...",FUNCTION_NAME);
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
      _logger.error("{}.Ошибка команды {}. Попытка {}/{}. Отправили url: {}, data: {}. Получили Status: {}, Body: {}",FUNCTION_NAME,
        method, attempt, MAX_RETRIES, url, JSON.stringify(data), status, response.getBody());

      if (attempt < MAX_RETRIES) {
        _logger.warn("{}.Повторная попытка отправки запроса через {} мс",FUNCTION_NAME, RETRY_DELAY);
        setTimeout(trySendRequest, RETRY_DELAY);
      } else {
        _logger.error("{}.Исчерпано максимальное количество попыток отправки запроса.",FUNCTION_NAME);
      }
    }

    return response;
  }

  return trySendRequest();
}

// Функция отправки POST-запроса. 
function sendPostRequest(url, data) {
  return sendRequestWithRetry('POST', url, data);
}

// Функция отправки GET-запроса.
function sendGetRequest(url, data) {
  return sendRequestWithRetry('GET', url, data);
}

// Функция получения текущего состояния устройства (включено или выключено) по Id
function switchStatusById(device) {
  var FUNCTION_NAME = 'switchStatusById';
  if (!isDeviceHealthyById (device)) {return null};
  
  var uri = uriDevices + device;
  var response = sendGetRequest(uri);

  if (response.getStatus() !== 200) {
     _logger.error("{}.Ошибка получения состояния устройства: {}",FUNCTION_NAME,response.getStatus());
    return null;
  }

  var body = JSON.parse(response.getBody());
  var capabilities = body.capabilities;

  for (var i = 0; i < capabilities.length; i++) {
    if (capabilities[i].type === "devices.capabilities.on_off") {
      return capabilities[i].state.value === true;
    }
  }

   _logger.error("{}.Состояние on_off не найдено для устройства: {}",FUNCTION_NAME, device);
  return response;

}

// Функция получения текущего состояния устройства (включено или выключено) по Названию
function switchStatus(deviceName) {
  device=global.caseDevice(deviceName);
  if (!device) return null;
  return switchStatusById(device);
}

// Функция получения статуса устройства (online или нет) по Id
function deviceIsOnlineById(device) {
  var FUNCTION_NAME = 'deviceIsOnlineById';
  var deviceEsist = isDeviceExist (device)
  if (!deviceEsist) {
      _logger.error("{}.Устройство не найдено в умном доме id:'{}'",FUNCTION_NAME,device);
      return null;
  }

  var uri = uriDevices + device;
  var response = sendGetRequest(uri);

  if (response.getStatus() !== 200) {
     _logger.error("{}.Ошибка получения состояния устройства: {}",FUNCTION_NAME,response.getStatus());
    return null;
  }

  var body = JSON.parse(response.getBody());

  var statusInfo = body.status_info;
  
  if (statusInfo && statusInfo.status) {
    //_logger.info("status_info statusInfo.status: {}", statusInfo.status);
    var result=statusInfo.status==="online";
    if (!result)
     {_logger.warn("{}.Устройство не online. Статус: '{}';для устройства:'{}'",FUNCTION_NAME, statusInfo.status,device);}

    return result;//!!!ПОХОЖЕ НА ОШИБКУ где возврат второй части результата
  }
   _logger.error("{}.status_info не найдено для устройства: {}",FUNCTION_NAME, device);
  return null;
}

// Функция получения статуса устройства (online или нет) по Названию
function deviceIsOnline(deviceName) {

  device=global.caseDevice(deviceName);
  if (!device) return; 
  return deviceIsOnlineById(device);
}

// Функция переключения состояния устройства (включение, выключение, переключение) по id
function switchComandById(device,comand)
{
  var FUNCTION_NAME = 'deviceIsOnlineById';
  var validCommands = { "On": true, "Off": false, "Switch": "switch" };
  if (!isDeviceHealthyById (device)) {return null};

  if (!validCommands.hasOwnProperty(comand)) {
     _logger.warn("{}.Неверная команда: ",FUNCTION_NAME,comand);
    return;
  }

  // Если команда Switch, сначала получаем текущее состояние устройства
  if (comand === "Switch") {
    var uri = uriDevices + device;
    var response = sendGetRequest(uri);

    if (response.getStatus() !== 200) {
       _logger.error("{}.Ошибка получения состояния устройства: {}",FUNCTION_NAME,response.getStatus());
      return;
    }

    var body = JSON.parse(response.getBody());
    var capabilities = body.capabilities;
    var currentState = null;

    for (var i = 0; i < capabilities.length; i++) {
      if (capabilities[i].type === "devices.capabilities.on_off") { 
        currentState = capabilities[i].state.value;
        break;
      }
    }

    if (currentState === null) {
       _logger.error("{}.Не удалось определить текущее состояние устройства: {}",FUNCTION_NAME,device);
      return;
    }

    var newState = !currentState;
    var actions = createActions("on", newState);
    sendActionsById(device, actions);
  } else {
    // Команды On или Off
    var actions = createActions("on", validCommands[comand]);
    sendActionsById(device, actions);
  }
  return response;
}

// Функция переключения состояния устройства (включение, выключение, переключение) по названию
function switchComand(deviceName, comand) {
  device=global.caseDevice(deviceName);
  if (!device) return;
  return switchComandById(device,comand)
}

// Обновление CSRF-токена
function refreshToken() {
  var FUNCTION_NAME = 'refreshToken';
  const response = HttpClient.GET(tokenURL).header("Cookie", cookies).send();
  if (response.getStatus() !== 200) {
    _logger.error("{}.Ошибка обновления refreshToken: Status: {}, Body: {}",FUNCTION_NAME, response.getStatus(), JSON.stringify(response.getBody()));
    return;
  }
  csrf_token = JSON.parse(response.getBody()).storage.csrfToken2;
  _logger.info("{}.csrf_token обновлён.",FUNCTION_NAME);
}

// Обновление кукис-данных. Cookies сохраняются в LocalStorage
function refreshCookies() {
    var FUNCTION_NAME = 'refreshCookies';

    // Получаем текущие настройки и куки
    var settings = global.LocalStorage.getValue(_yandexSmartHomeSettingsName) || {};
    var currentCookies = settings.cookies || cookies;

    _logger.info('{}.Инициализация запроса токена. Текущие cookies: {}', FUNCTION_NAME, currentCookies);

    // Выполняем GET‑запрос
    var response = HttpClient.GET(tokenURL)
        .header('Cookie', currentCookies)
        .send();

    var status = response.getStatus();

    if (status !== 200) {
        _logger.error('{}.Ошибка HTTP: Status: {}, Body: {}', FUNCTION_NAME, status, JSON.stringify(response.getBody()));
        return;
    }

    // Обновляем cookies, если сервер прислал их
    var responseCookies = response.getCookies();
    if (responseCookies && !global.CookiesUtils.isEmpty(responseCookies)) {
        cookies = global.CookiesUtils.toString(
            global.CookiesUtils.apply(
                global.CookiesUtils.toObject(currentCookies),
                responseCookies
            )
        );

        _logger.info('{}.Получены новые cookies: {}', FUNCTION_NAME, cookies);
        _logger.info('{}.Пытаемся сохранить cookies в LocalStorage', FUNCTION_NAME);

        // Пишем новые cookies в LocalStorage
        try {
            global.LocalStorage.setValue(_yandexSmartHomeSettingsName, { cookies: cookies });
        } catch (err) {
            _logger.error('{}.Ошибка при записи в LocalStorage: {}', FUNCTION_NAME, err);
            return;
        }

        // Проверяем, что запись прошла успешно
        var savedSettings = global.LocalStorage.getValue(_yandexSmartHomeSettingsName) || {};
        var savedCookies = savedSettings.cookies;

        if (typeof savedCookies === 'undefined' || savedCookies !== cookies) {
            _logger.error('{}.Проверка сохранения неудачна. Ожидалось: {}, Получено: {}', FUNCTION_NAME, cookies, savedCookies);
        } else {
            _logger.info('{}.Cookies успешно обновлены и проверены.', FUNCTION_NAME);
        }
    } else {
        _logger.warn('{}.Ответ не содержит cookies для обновления.', FUNCTION_NAME);
    }
}

// Инициализация. Запускается на старте Хаба и при нажатии Play на сценарии
function initialize() {
  var FUNCTION_NAME = 'initialize';
  _logger = global.LoggerFactory.create(logPrefix+' '+version);
  _logger.info("{}.Инициализация. Yandex for Sprut. Part 2. Engine.Start",FUNCTION_NAME)
  const storedSettings = global.LocalStorage.getValue(_yandexSmartHomeSettingsName);
  if (storedSettings && storedSettings.cookies) {
      //_logger.info("Инициализация storedSettings Ok");
      cookies = storedSettings.cookies
    }
  else {
  //  _logger.info("Инициализация storedSettings NOT-Ok");
      cookies= global.getInitialCookeies();
    };

   _logger.info("{}.Инициализация. Yandex for Sprut. Part 2. Engine.Finish",FUNCTION_NAME)
};
})()