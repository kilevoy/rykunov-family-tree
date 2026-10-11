# Компоненты: «Родословная Рыкуновых»

Источник списка — `replica/recon.md` (раздел Components, экраны S01–S26). Значения из `tokens.json`. Тексты и иконки — свои: иконки из Lucide (MIT), подписи пишем заново, не копируем Genery. Состояния «empty / loading / error» у оригинала не наблюдались [не известно], они добавлены по умолчанию.

Общее для всех: нативные элементы (`button`, `input`, `table`), видимый фокус (`:focus-visible`, 2px accent), минимальная цель касания 40px (на телефоне 44px), цвет не единственный носитель смысла.

## Button
```
variants  primary (accent), secondary (border + text), ghost, danger
sizes     sm 32, md 40, lg 48
states    default, hover, active, focus-visible, disabled (disabled-bg/disabled-text), loading (метка остаётся для скринридера)
tokens    radius md, text sm/600
a11y      <button>, loading → aria-busy
used on   S01–S09, S22–S25
```

## ActionPanel (боковая панель действий)
```
variants  desktop sidebar 220px; mobile — нижний/выдвижной список
states    пункт default / hover / disabled (нет прав или нет выбранной строки)
note      набор действий зависит от вкладки (по S01: Создать, Изменить, Удалить, Показать, Построить древо/роспись, Настройка, Отчёты, Карта)
a11y      <nav aria-label>, пункты — кнопки
used on   S01–S08
```

## Tabs (вкладки с счётчиками)
```
variants  верхние вкладки: Персоны, Древо, События, Документы, Места, Источники, Роды, Задачи; вкладки окна персоны
states    active (подчёркивание accent), hover, focus, disabled; бейдж-счётчик muted
a11y      role=tablist/tab/tabpanel, стрелки влево-вправо
used on   S01, S09
```

## DataTable (персоны, события, документы…)
```
columns   фото (миниатюра), ФИО, дата рождения, место жительства, занятие, комментарий (из S01)
states    default, row-hover, row-selected (selected), sorted asc/desc, loading (skeleton), empty («пока никого нет» + кнопка), error
a11y      <table>, сортировка через button в заголовке, aria-sort, выбор строки клавишами
mobile    карточки вместо таблицы (≤640px)
used on   S01, S03–S08
```

## PersonCard (карточка в дереве)
```
variants  male (card-male), female (card-female), unknown (card-unknown); selected (рамка accent 2px), root (крупнее), private (иконка замка), collapsed (бейдж «+N»)
content   фото 84px слева, ФИО, даты жизни, подпись родства курсивом (по S02: «Сын», «Жена»)
size      220×84, radius card; ФИО tree-name, даты tree-dates
states    default, hover, focus, selected, dragging-нет, loading photo (заглушка-силуэт)
a11y      кнопка/ссылка с aria-label «ФИО, годы, родство»; обход стрелками по графу
used on   S02
```

## TreeCanvas и MarriageLine
```
TreeCanvas   SVG, масштаб 50–200%, панорамирование, «на весь экран», tree-band для строки родителей/супругов
MarriageLine линия брака с подписью даты (S02: «18.02.1831»), стили: брак, развод (пунктир), приёмное (точки)
states       empty («добавьте первую персону»), loading, error
a11y         альтернативный список «Родство» под деревом; клавиши +/- для масштаба
used on      S02, S24
```

## PreviewPanel (нижняя панель просмотра)
```
content   фото, ФИО, события («Родился: …», «Умер: …»), ссылки на родных (Отец, Мать, Жена, Дети)
parts     строка поиска, назад/вперёд, закладка, «фаворит», свёрнуть/развернуть
states    свёрнута, развёрнута, нет выбранной персоны (подсказка)
used on   S01, S02
```

## Field-блоки окна персоны
```
Text input         label сверху, border-input 1px, radius md, ошибка → danger + текст ошибки (aria-describedby)
Date input         поле текста с подсказкой формата + кнопка «уточнить дату» (приблизительная, между, юлианская); хранит текст + разобранную форму
Link field         «Отец: нет данных» → кнопка выбора человека/места/рода в диалоге-таблице
Select             нативный <select>, на десктопе допускается combobox
Checkbox           «В живых», «Фаворит», «Дети есть/нет/неизвестно» (три значения → radio-group)
Privacy level      слайдер 0–10 с цифрой (aria-valuenow) + иконка замка; high ≥ 6 подсвечен private
Reliability        то же, шкала 0–10
Comment            textarea, авторастягивание, ссылки кликабельны
states             default, hover, focus, filled, disabled, read-only (для viewer), error
used on            S09, S20
```

## Modal / Dialog
```
variants  edit (персона, событие), confirm (удаление), picker (выбор человека/места), settings (настройка отчёта/древа, экспорт)
footer    Отмена (secondary) и OK (primary); OK disabled, пока форма не валидна
states    default, loading (кнопка в loading), error (баннер вверху), unsaved-changes (подтверждение при закрытии)
a11y      role=dialog, aria-modal, фокус внутрь и возврат, Esc, ловушка фокуса
mobile    экран во всю высоту
used on   S09, S16, S17, S20, S22, S23
```

## PhotoViewer и PhotoTag
```
content   фото, рамки людей (x,y,w,h в долях 0–1), имя и возраст на снимке при наведении/фокусе
states    просмотр, режим отметки (тянуть рамку, соотношение «a:b» — свой UI), нет доступа (private)
a11y      список отмеченных людей текстом под фото; рамки доступны с клавиатуры
used on   S21
```

## Uploader
```
states    idle, drag-over, uploading (прогресс), done, error (тип/размер), приватный файл
limits    JPEG/PNG/PDF, до 20 МБ (из architecture.md)
used on   S04, S11
```

## Toast / Banner
```
variants  success, error, warning, info (иконка + текст, не только цвет)
behaviour toast исчезает через 5 с, не при наведении; banner остаётся
a11y      role=status (success/info), role=alert (error)
note      «Только чтение» (S25) — постоянный banner, не toast; «версия устарела (409)» — banner с кнопкой «обновить»
```

## ReadOnlyBadge, PrivacyBadge
```
ReadOnly   значок «только чтение» вверху окна, поле формы read-only
Privacy    замок + число; у viewer приватные записи не показываются вовсе
```

## ReportView (страница персоны и роспись)
```
S14  заголовок, фото с подписью, блок родства, хронология (дата слева, текст справа)
S15  нумерация д'Абовилля, фото, события
S16  панель настроек: чекбоксы, выпадающие списки, поля префикса/суффикса
actions  Сохранить (PDF/HTML), Открыть в новой вкладке, Изменить, Карта
print    отдельные стили @media print: белый фон, без панелей
```

## Menu / Dropdown
```
variants  меню «Создать» (Отец, Мать, Брат/сестра, Муж/жена, Ребёнок) — пункты disabled по правилам [recon 6]; меню блока «⋮»; меню «Файл»
a11y      role=menu, стрелки, Esc; недоступные пункты aria-disabled + подсказка почему (напр. «у человека уже есть отец»)
```

## Map (места и события)
```
engine    OpenStreetMap-тайлы через Leaflet (внешний сервис; лимиты и атрибуция обязательны)
states    loading, нет координат, нет интернета
```

## Empty / Loading / Error (общие шаблоны)
```
Empty     иллюстрация/иконка + 1 фраза + 1 кнопка действия; тексты свои
Loading   skeleton для таблиц и карточек
Error     понятная фраза + «повторить»; для 403 — «нет доступа к этой записи» без раскрытия, что запись существует
```
