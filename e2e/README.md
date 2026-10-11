# E2E

Без зависимостей: Node 22 и Chromium (путь берётся из /opt/pw-browsers или переменной CHROME).

    node e2e/run.mjs                                                       # интерфейс, Chromium по CDP
    node --test app/tests/data.test.mjs app/tests/regression.test.mjs      # логика

Когда появится npm, перенести на Playwright и добавить проверку доступности axe (см. replica/bugs.md, раздел «К проверке»).
