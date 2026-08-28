/**
 * Сборка настроек: обход хаба → меню → публичный объект TGActionsSettings.
 *
 * Порядок создания = порядок зависимостей, менять нельзя.
 */
function TGActionsSettingsIndex() {
    var ns = {};

    // local.js не отслеживается git и в сборку с плейсхолдерами не попадает.
    // Его отсутствие — рабочее состояние репозитория, а не ошибка.
    ns.local = (typeof TGActionsLocal === 'function') ? TGActionsLocal() : null;

    ns.actions = TGActionsActions();
    ns.visibility = TGActionsVisibility();
    ns.access = TGActionsAccess(ns);
    ns.discovery = TGActionsDiscovery(ns);
    ns.menu = TGActionsMenu(ns);

    // buttonSets отдаётся движку по ссылке и переполняется на месте при
    // /refresh: движок читает global.TGActionsSettings.buttonSets в момент
    // нажатия, поэтому подменять сам объект нельзя — только его содержимое.
    var buttonSets = {};

    ns.menuState = {
        inventory: { actions: [], sensors: [], rooms: [], errors: [] },
        index: { rooms: 0, devices: 0, actions: 0 },
        refresh: function () {
            var inventory = ns.discovery.scan();
            var built = ns.menu.build(inventory);

            for (var old in buttonSets) {
                if (buttonSets.hasOwnProperty(old)) {
                    delete buttonSets[old];
                }
            }
            for (var name in built.buttonSets) {
                if (built.buttonSets.hasOwnProperty(name)) {
                    buttonSets[name] = built.buttonSets[name];
                }
            }

            ns.menuState.inventory = inventory;
            ns.menuState.index = built.index;
            return { inventory: inventory, index: built.index };
        }
    };

    ns.menuState.refresh();

    // Чаты для движка выводятся из профилей доступа: один источник правды,
    // иначе белый список чатов и политика доступа разъедутся.
    var chats = { _default: ns.access.profiles[0].key };
    for (var i = 0; i < ns.access.profiles.length; i++) {
        chats[ns.access.profiles[i].key] = ns.access.profiles[i].chatId;
    }

    return {
        // Описания по умолчанию для setBotMeta: движок берёт их, если у бота
        // ниже не заданы description / shortDescription. Раньше на этой ветке
        // читались свободные глобальные BOT_DESCRIPTION / BOT_SHORT_DESCRIPTION,
        // нигде не объявленные, — то есть ReferenceError.
        // Лимиты Telegram: описание ≤ 512 символов, короткое ≤ 120.
        botDescription: 'Управление умным домом на базе Sprut.hub',
        botShortDescription: 'Умный дом',
        bots: {
            _default: 'home',
            home: {
                key: ns.local && ns.local.botKey ? ns.local.botKey : 'Заполнить',
                description: 'Управление умным домом',
                shortDescription: 'Умный дом',
                autoStart: true
            }
        },
        chats: chats,
        replyKeyboardSets: {},
        buttonSets: buttonSets,
        botCommands: TGActionsCommands(ns),
        _diag: ns.menuState
    };
}
