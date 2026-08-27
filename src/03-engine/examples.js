/*
 * ─────────────────────────  Дополнительные примеры  ─────────────────────────
 *
 * // Отправить сообщение и удалить его через 10 секунд:
 * TGActions.sendSimpleMessage('botName1', 'chatName1', 'Временное сообщение', {
 *     autoDeleteAfterSec: 10
 * });
 *
 * // Зарегистрировать новую клавиатуру «yesNo» на лету:
 * TGActions.registerReplyKeyboardSet('yesNo', [ ['👍 Да', '👎 Нет'] ]);
 *
 * // Показать новую клавиатуру
 * TGActions.sendReplyKeyboard('botName1', 'chatName1', 'yesNo', 'Голосуем!');
 */
