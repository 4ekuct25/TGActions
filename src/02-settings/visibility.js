/**
 * Что боту не показывать.
 *
 * Списки — чёрные, а не белые: новая комната или устройство в хабе попадают в
 * бота сами, без правки конфига. Платой идёт то, что лишнее нужно заметить и
 * вписать сюда руками.
 *
 * Почему руками. Видимость СЕРВИСА хаб отдаёт сценарию сам — `getServices(true)`
 * возвращает только видимые, и это уже учтено в discovery.js. А вот у комнаты и
 * у аксессуара признака видимости в объектной модели сценариев нет: у Room есть
 * только getName/getAccessories, у Accessory — getName/getServices и метаданные
 * железа (см. ScenarioTemplate/spruthub.js). В веб-интерфейсе поле visible у
 * комнаты есть, но сценарию оно недоступно.
 *
 * Порядок комнат — по алфавиту. Порядок из хаба (поле order) сценарию тоже не
 * виден, а алфавит не требует ведения списка и не разъезжается с хабом.
 *
 * Зависимостей нет.
 */
function TGActionsVisibility() {

    // Комнаты, скрытые в хабе «Усадьба» на 2026-08-28: Терраса, Крыльцо,
    // Спальня Александра, Спальня Арина, Новая комната, Теплица. Здесь только
    // «Новая комната» — остальные пусты, и отсеиваются сами (комната без
    // единого пригодного устройства в меню не попадает).
    var hiddenRooms = [
        'Новая комната'
    ];

    // Аксессуары по имени. Имя видно в хабе и в /status.
    // Пусто намеренно: что прятать — решает хозяин дома. Пример записи:
    //     'Датчик дыма'   // сирену из бота дёргать незачем
    var hiddenAccessories = [
    ];

    function contains(list, name) {
        for (var i = 0; i < list.length; i++) {
            if (list[i] === name) {
                return true;
            }
        }
        return false;
    }

    function isRoomHidden(name) {
        return contains(hiddenRooms, name);
    }

    function isAccessoryHidden(name) {
        return contains(hiddenAccessories, name);
    }

    /**
     * Алфавитная сортировка имён.
     *
     * localeCompare в Nashorn ведёт себя непредсказуемо, поэтому сравниваем
     * напрямую: для одного алфавита порядок кодовых точек — это алфавит.
     */
    function sortNames(names) {
        return names.slice().sort(function (a, b) {
            if (a === b) {
                return 0;
            }
            return a < b ? -1 : 1;
        });
    }

    return {
        hiddenRooms: hiddenRooms,
        hiddenAccessories: hiddenAccessories,
        isRoomHidden: isRoomHidden,
        isAccessoryHidden: isAccessoryHidden,
        sortNames: sortNames
    };
}
