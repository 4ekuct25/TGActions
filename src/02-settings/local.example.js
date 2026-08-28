/**
 * Образец local.js — файла с секретами, который в git НЕ попадает.
 *
 * Скопировать рядом под именем local.js и заполнить:
 *
 *     cp src/02-settings/local.example.js src/02-settings/local.js
 *
 * Затем собрать версию для хаба:
 *
 *     python3 tools/scenarios.py build --local     # положит в dist/
 *
 * Обычный build собирает экспорт с плейсхолдерами — его и коммитим.
 */
function TGActionsLocal() {
    return {
        // Токен от @BotFather
        botKey: '0000000000:ЗАМЕНИТЬ',

        // Ключ профиля из access.js → id чата.
        // f — семейная группа (id отрицательный), p — личные сообщения.
        // Узнать id: команда /who в нужном чате.
        chats: {
            p: '000000000'
            // f: '-1000000000000'
        },

        // Белый список. critical: true — можно трогать кран, сирену, сигнализацию.
        users: {
            '000000000': { name: 'Хозяин', critical: true }
        }
    };
}
