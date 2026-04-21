# agent-task-room

`agent-task-room` — это TypeScript-пакет для общей task-room сессии между двумя людьми и двумя агентами, когда у сторон может быть разный локальный контекст, разные проекты и одна общая задача.

Пакет не пытается синхронизировать репозитории как `git`-утилита. Вместо этого он:

- поднимает общую комнату задачи;
- хранит описание задачи или `Jira`-ссылку;
- заставляет обе стороны объявить свой контекст;
- даёт единый `web UI` для общей ленты и человеческих решений;
- хранит `artifacts` и `decision log` как отдельные сущности комнаты;
- предоставляет `MCP`-слой для агентных клиентов;
- предоставляет `A2A`-слой для более совместимого agent-to-agent транспорта;
- сохраняет сессии в `SQLite` по умолчанию;
- покрывает доменный и HTTP-слой тестами.

## Технологический стек

- `TypeScript`
- `Node.js >= 22.5`
- `Express`
- `MCP SDK`
- `A2A JS SDK`
- встроенный `node:sqlite`
- `Vitest`
- `ngrok`

## Что уже умеет пакет

- команда `start` поднимает локальный сервер, `ngrok`, создаёт комнату и печатает всё, что нужно переслать коллеге;
- UI доступен через браузер и позволяет:
  - видеть статус комнаты;
  - читать общую ленту;
  - отправлять общее сообщение обоим участникам;
  - прикладывать ссылки, diff, логи и issue/PR как отдельные артефакты;
  - вести `decision log` с summary, rationale и статусом решения;
  - запускать быстрые действия координатора одной кнопкой;
  - подтверждать, отклонять или продлевать сессию;
- `MCP`-сервер позволяет агентам:
  - открыть или подключить комнату;
  - опубликовать контекст;
  - обмениваться типизированными сообщениями;
  - публиковать артефакты и решения как отдельные сущности;
  - отправлять финальные позиции;
- `A2A`-сервер позволяет делать то же самое через стандартный `Agent Card` и `message/send`;
- `A2A` умеет не только direct-message, но и `task/stream` режим для живой подписки на room updates;
- `A2A push notifications` можно использовать для webhook-доставки обновлений без polling;
- по умолчанию состояние сервера хранится в `.agent-task-room/rooms.sqlite` и переживает перезапуск;
- доступны поиск по прошлым и текущим комнатам и unified history по комнате.

## Установка

```bash
npm install
npm run compile
npm run link:local
```

После `npm link` команда `agent-task-room` станет доступна из других проектов на этой машине.

## Установка из GitHub

Пока пакет ещё не опубликован в `npm`, его можно ставить напрямую из GitHub:

```bash
npm install -g https://codeload.github.com/tradchenko/agent-task-room/tar.gz/main
agent-task-room help
```

В репозиторий уже включён предсобранный `dist`, поэтому такая установка не должна зависеть от локального `prepare`-цикла и dev-зависимостей на машине коллеги.

Если `npm install -g git+https://github.com/...` падает на `git dep preparation failed`, это обычно связано не с самим пакетом, а с внутренним install-cycle конкретной версии `npm`. Установка через `codeload.github.com/.../tar.gz/main` обходит этот путь и работает надёжнее.

## Быстрая проверка

```bash
npm run check
```

Эта команда прогоняет:

- typecheck через `tsc`
- тесты через `vitest`

Если у тебя Node ниже `22.5`, сначала обнови его. SQLite backend использует встроенный `node:sqlite`, поэтому отдельный нативный npm-драйвер ставить не нужно.

## Установка ngrok

### macOS

```bash
brew install ngrok/ngrok/ngrok
ngrok config add-authtoken <YOUR_TOKEN>
```

### Windows

```powershell
winget install --id Ngrok.Ngrok
ngrok config add-authtoken <YOUR_TOKEN>
```

### Linux

1. Скачать `ngrok` с [официального сайта](https://ngrok.com/download)
2. Добавить бинарник в `PATH`
3. Выполнить:

```bash
ngrok config add-authtoken <YOUR_TOKEN>
```

## Быстрый старт

### Самый простой локальный сценарий

```bash
agent-task-room session \
  --title "Аудит контракта между сервисами" \
  --task "Нужно согласовать API и финальное поведение UI"
```

Эта команда:

1. Поднимет локальный сервер на `127.0.0.1:8876`.
2. Создаст комнату и локальный watcher.
3. Сразу попробует открыть страницу владельца в браузере.
4. Напечатает две ссылки:
   - `Ссылка владельцу`
   - `Ссылка второму участнику`
5. Сохранит всё нужное в `.agent-task-room/`.

Дальше поток такой:

1. Страница владельца открывается автоматически.
2. Коллеге отправляешь `Ссылка второму участнику`.
3. Коллега открывает invite-ссылку, нажимает кнопку подключения к комнате и видит готовую инструкцию для своего агента.
4. Ты у себя тоже видишь готовую инструкцию для своего агента.

Технические `MCP`, `A2A` и резервные CLI-команды остаются доступны, но спрятаны в UI в разделе `Технические детали`.

Если браузер не открылся автоматически, можно просто открыть `Ссылка владельцу` вручную из вывода команды.

### Публичный сценарий через ngrok

```bash
agent-task-room start \
  --title "Аудит контракта между сервисами" \
  --jira "https://jira.example.com/browse/TASK-123" \
  --comment "Нужно согласовать API и финальное поведение UI"
```

Или без Jira:

```bash
agent-task-room start \
  --title "Разбор проблемы интеграции" \
  --task "Понять, как две системы должны согласовать результат долгой операции" \
  --comment "У второй стороны есть дополнительный локальный контекст"
```

Команда сама:

1. Поднимет локальный HTTP/MCP сервер.
2. Поднимет публичный `ngrok`-туннель.
3. Создаст общую комнату.
4. Запустит локальный watcher.
5. Напечатает:
   - `MCP URL`
   - `A2A JSON-RPC URL`
   - `A2A REST URL`
   - `UI URL`
   - `Room URL`
   - токен
   - готовую команду для коллеги
   - текст для твоего агента
   - текст для агента коллеги
   - готовые `A2A`-envelope примеры для `watch_room` и `pushNotificationConfig`

## Как работает UI

После `start` ты получишь публичные owner/invite-ссылки на комнату.

В UI можно:

- видеть список комнат;
- искать по задачам, сообщениям, артефактам и решениям;
- читать текущий статус и `next steps`;
- использовать быстрые действия:
  - попросить обновить контекст;
  - запросить перепроверку;
  - попросить свести решение;
  - попросить финальные позиции;
  - скопировать room link, команду join, prompt для коллеги и `A2A watch` envelope;
- отправлять общее человеческое сообщение в общую ленту;
- сохранять артефакты, чтобы не терять внешний контекст в сообщениях;
- фиксировать промежуточные и финальные решения в `decision log`;
- просматривать unified history комнаты;
- принимать решение:
  - `approve_solution`
  - `reject_solution`
  - `keep_session_active`

Важно:

- room-specific инструкции (`join`, prompt для коллеги, `A2A watch` envelope) показываются только для комнаты, которая была открыта текущим `start`;
- если ты просто смотришь старую или чужую комнату из списка, UI всё равно даст корректную ссылку на саму комнату, но не будет подсовывать устаревшие launch-артефакты.
- если launch-метаданные для комнаты недоступны, UI всё равно покажет универсальную инструкцию для агента и даст работать дальше без полного выпадения из сценария.

## Что делает второй участник

В новом локальном сценарии ему достаточно открыть invite-ссылку в браузере. Это основной путь.

Дальше он:

1. Нажимает `Подключиться к комнате`.
2. Копирует `Инструкцию для моего агента`.
3. Вставляет её в свой чат с агентом.

CLI нужен только как запасной вариант или если агент реально работает через локальную командную интеграцию.

Коллеге достаточно выполнить готовую команду из вывода `start` или из `.agent-task-room/share.txt`.

Типичный вид:

```bash
AGENT_TASK_ROOM_URL='https://.../mcp' \
AGENT_TASK_ROOM_TOKEN='...' \
AGENT_TASK_ROOM_ROOM_ID='room-...' \
AGENT_TASK_ROOM_PARTICIPANT_ID='peer-agent' \
AGENT_TASK_ROOM_PARTICIPANT_LABEL='Peer Agent' \
AGENT_TASK_ROOM_ROLE='peer' \
agent-task-room join
```

Если второй агент умеет работать напрямую по `A2A`, можно использовать и стандартные endpoint-ы:

- `https://.../.well-known/agent-card.json`
- `https://.../a2a/jsonrpc`
- `https://.../a2a/rest`

Для живой доставки сообщений есть два режима:

- `message/stream` с командой `watch_room`
- `message/send` с `blocking=false` и `pushNotificationConfig`

После `start` готовые JSON-примеры сохраняются в:

- `.agent-task-room/examples/a2a-watch.json`
- `.agent-task-room/examples/a2a-push.json`

## Troubleshooting

Если `start` сообщает, что на адресе уже отвечает `agent-task-room`, но локальный `PID` отсутствует или устарел, это значит, что живой сервер остался от предыдущего запуска вне текущего state.

В таком случае:

1. Останови старый процесс вручную.
2. Убедись, что порт свободен.
3. Повтори `agent-task-room start`.

Такой сценарий теперь останавливается сразу, чтобы `start` не записал PID уже умершего дочернего процесса и не оставил сломанное состояние для `stop/restart`.

## Как UI связан с агентами

`web UI` не пытается встроиться прямо в интерфейс `Claude` или `Codex`.

Связка устроена так:

1. `UI` — это человеческая панель комнаты.
2. `room backend` — общий источник правды.
3. `агенты` читают и пишут в ту же комнату через `CLI`, `MCP` или `A2A`.

То есть люди работают в браузере, а агенты работают в своём чате, но публикуют данные в ту же самую комнату. Именно поэтому и лента, и артефакты, и решения видны обеим сторонам в одном месте.

## Что делать в чатах агентов

Обоим агентам нужно вставить готовый prompt из файлов:

- `.agent-task-room/prompts/local-agent.txt`
- `.agent-task-room/prompts/peer-agent.txt`

После этого агент работает через CLI:

- `agent-task-room sync`
- `agent-task-room search --query "..."`
- `agent-task-room history --limit 50`
- `agent-task-room context --system-scope "..." --summary "..."`
- `agent-task-room message --kind finding --body "..."`
- `agent-task-room artifact --kind github_pr --title "..." --uri "..."`
- `agent-task-room decision --title "..." --summary "..." --status accepted`
- `agent-task-room position --stance agree --summary "..." --decision "..."`

Если агент уже подключён к `A2A`, он может отправлять типизированные data-команды вида:

```json
{
  "kind": "task-room-command",
  "command": "add_artifact",
  "payload": {
    "roomId": "room-123",
    "participantId": "reviewer-agent",
    "kind": "github_pr",
    "title": "PR с предлагаемым исправлением",
    "uri": "https://github.com/example/repo/pull/42"
  }
}
```

Для фиксации договорённостей:

```json
{
  "kind": "task-room-command",
  "command": "record_decision",
  "payload": {
    "roomId": "room-123",
    "participantId": "reviewer-agent",
    "title": "Сначала синхронизировать контракт",
    "summary": "Без этого дальнейшее обсуждение снова разойдётся по разным предпосылкам.",
    "status": "accepted"
  }
}
```

Для поиска по пространству комнат:

```json
{
  "kind": "task-room-command",
  "command": "search_rooms",
  "payload": {
    "query": "feature flag rollout",
    "limit": 10
  }
}
```

Для просмотра единой истории комнаты:

```json
{
  "kind": "task-room-command",
  "command": "get_room_history",
  "payload": {
    "roomId": "room-123",
    "limit": 50
  }
}
```

Для живого потока обновлений комнаты используется команда:

```json
{
  "kind": "task-room-command",
  "command": "watch_room",
  "payload": {
    "roomId": "room-123",
    "afterSequence": 42
  }
}
```

Её стоит отправлять через:

- `sendMessageStream`, если агент умеет держать живое соединение;
- или `sendMessage` c `blocking=false` и `pushNotificationConfig`, если агенту удобнее получать webhook-пуши.

## Основные команды

```bash
agent-task-room start --title "..." --task "..."
agent-task-room start --title "..." --jira "https://jira/..."
agent-task-room join
agent-task-room sync
agent-task-room search --query "..."
agent-task-room history --limit 50
agent-task-room watch --interval 5
agent-task-room context --system-scope "..." --summary "..."
agent-task-room message --kind finding --body "..."
agent-task-room artifact --kind github_issue --title "..." --uri "..."
agent-task-room decision --title "..." --summary "..." --status proposed
agent-task-room position --stance agree --summary "..." --decision "..."
agent-task-room human-confirm --verdict approve_solution --comment "..."
agent-task-room status
agent-task-room close
agent-task-room stop
```

## Структура проекта

```text
src/
  bin/                  # CLI entrypoint
  cli/                  # TaskRoomCli и пользовательские сценарии
  domain/room/          # доменная модель комнат и сервис правил
  infrastructure/
    a2a/                # A2A-адаптер и Agent Card
    http/               # HTTP API и Web UI
    mcp/                # MCP-адаптер
    persistence/        # JSON repository
  server/               # bootstrap HTTP/MCP сервера
  shared/               # общие утилиты, аргументы, пути состояния

test/
  domain/room/          # тесты доменной логики
  infrastructure/       # тесты HTTP и persistence
```

## TDD

Пакет развивается через test-first подход.

Сейчас тестами покрыты:

- правила статусов комнаты;
- финальные позиции и human confirmation;
- JSON repository;
- базовый HTTP API;
- artifacts и decision log через доменный, HTTP, CLI и A2A слои;
- A2A discovery, message/send, stream и push-notifications.

## Где хранится состояние

- локальное состояние участника: `.agent-task-room/session.json`
- launch-метаданные: `.agent-task-room/launch.json`
- серверное хранилище: `.agent-task-room/rooms.sqlite`
- короткие инструкции: `.agent-task-room/alerts/latest.txt`
- готовый текст для коллеги: `.agent-task-room/share.txt`
- готовые A2A примеры: `.agent-task-room/examples/a2a-watch.json`, `.agent-task-room/examples/a2a-push.json`

## Документация

- [Архитектура](./docs/ARCHITECTURE.md)
