/**
 * Правила: какие характеристики считать действиями и чем их рисовать.
 *
 * Правится руками, но редко: правил около десятка и они не зависят от того,
 * сколько у вас устройств. Сам список устройств не хранится нигде — он
 * строится обходом хаба (см. discovery.js).
 *
 * Отбор идёт БЕЛЫМ списком: в меню попадает только то, для чего есть правило
 * в ACTIONS или READONLY. Отдельного чёрного списка нет намеренно — он был,
 * но не отсекал ничего сверх белого списка и лишь создавал видимость фильтра.
 * Спрятать конкретное устройство можно через OVERRIDES с hide: true.
 *
 * Зависимостей нет.
 */
function TGActionsActions() {

    // kind:
    //   switch — две кнопки Вкл/Выкл
    //   range  — набор значений между getMinValue и getMaxValue
    //   choice — перечисление по labels
    // critical — действие требует допуска (см. access.js)
    var ACTIONS = {
        On: { kind: 'switch' },
        Active: { kind: 'switch', on: 1, off: 0, critical: true },
        Brightness: { kind: 'range', unit: '%', steps: [0, 25, 50, 75, 100] },
        ColorTemperature: { kind: 'range', points: 4 },
        TargetTemperature: { kind: 'range', unit: '°C', points: 5 },
        RotationSpeed: { kind: 'range', unit: '%', steps: [0, 20, 40, 60, 80, 100] },
        C_FanSpeed: { kind: 'range', points: 6 },
        TargetHeatingCoolingState: {
            kind: 'choice',
            labels: { '0': 'Выкл', '1': 'Тепло', '2': 'Холод', '3': 'Авто' }
        },
        SecuritySystemTargetState: {
            kind: 'choice',
            labels: { '0': 'Дома', '1': 'Ночь', '2': 'Охрана', '3': 'Снято' },
            critical: true
        }
    };

    // Показывать в сводке /status, но не давать кнопок.
    var READONLY = {
        CurrentTemperature: { unit: '°C' },
        CurrentRelativeHumidity: { unit: '%' },
        BatteryLevel: { unit: '%' },
        ContactSensorState: { labels: { '0': 'закрыто', '1': 'открыто' } },
        LeakDetected: { labels: { '0': 'сухо', '1': 'ПРОТЕЧКА' } },
        SmokeDetected: { labels: { '0': 'чисто', '1': 'ДЫМ' } },
        MotionDetected: { labels: { 'false': 'нет движения', 'true': 'движение' } }
    };

    // Точечные исключения по адресу 'aId,cId'. Разбирать значения из хаба
    // правилами по типу невозможно, когда дело в конкретном устройстве.
    var OVERRIDES = {
        '22,34': { hide: true },                        // «Самоочистка» кондиционера
        '19,19': { title: 'Сирена', critical: true },   // Датчик дыма → сирена
        '9,15': { title: 'Кран воды', critical: true },
        '25,15': { title: 'Водопроводный кран', critical: true }
    };

    return {
        ACTIONS: ACTIONS,
        READONLY: READONLY,
        OVERRIDES: OVERRIDES
    };
}
